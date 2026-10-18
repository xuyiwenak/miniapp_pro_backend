#!/usr/bin/python3
"""Reconcile Nginx certificate copies and verify configured Starryspark sites."""
import concurrent.futures
import datetime
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import time

SETTINGS = json.loads(Path(__file__).with_name('settings.json').read_text())
PROJECT = Path(os.environ.get('ART_BACKEND_DEPLOY_PATH', '/root/workspace/miniapp_pro_backend'))
LE_ROOT = Path('/etc/letsencrypt')
STATUS_ROOT = Path('/var/lib/certbot')
STATE_PATH = STATUS_ROOT / 'nginx-loaded-certificates.json'
AUDIT_PATH = STATUS_ROOT / 'starryspark-audit.json'
DAY_SECONDS = 86400


def run(*args):
  return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


def nginx_config():
  return run('docker', 'exec', 'miniapp-nginx', 'nginx', '-T').decode()


def nginx_tokens(config):
  lexer = shlex.shlex(config, posix=True, punctuation_chars='{};')
  lexer.whitespace_split = True
  for token in lexer:
    if token and set(token) <= set('{};'):
      yield from token
    else:
      yield token


def server_blocks(config):
  stack, command, current, blocks = [], [], None, []
  for token in nginx_tokens(config):
    if token == '{':
      kind = command[0] if command else ''
      stack.append(kind)
      if kind == 'server':
        current = {}
        blocks.append(current)
      command = []
    elif token == '}':
      if stack and stack.pop() == 'server':
        current = None
      command = []
    elif token == ';':
      if current is not None and stack and stack[-1] == 'server' and command:
        current[command[0]] = command[1:]
      command = []
    else:
      command.append(token)
  return blocks


def host_path(container_path):
  prefix = '/etc/nginx/ssl/'
  if container_path.startswith(prefix):
    return PROJECT / 'nginx/ssl' / container_path[len(prefix):]
  path = Path(container_path)
  if str(path).startswith(str(LE_ROOT) + '/'):
    return path
  raise ValueError('Unmapped certificate path: ' + container_path)


def fingerprint(path):
  der = run('openssl', 'x509', '-in', str(path), '-outform', 'DER')
  return hashlib.sha256(der).hexdigest()


def lineage_for(container_path):
  path = Path(container_path)
  if str(path).startswith(str(LE_ROOT / 'live') + '/'):
    return path.parent.name
  for lineage, target in SETTINGS['copies'].items():
    candidate = Path('/etc/nginx/ssl') / target / 'fullchain.pem'
    if path == candidate:
      return lineage
  return None


def site_inventory(config):
  sites = {}
  for block in server_blocks(config):
    cert = block.get('ssl_certificate', [])
    if not cert:
      continue
    for domain in block.get('server_name', []):
      if domain.endswith(SETTINGS['domainSuffix']) or domain == SETTINGS['domainSuffix'][1:]:
        if '*' in domain or domain.startswith('~'):
          raise ValueError('Wildcard server requires explicit audit hostnames: ' + domain)
        if domain in sites and sites[domain] != cert[0]:
          raise ValueError('Conflicting certificates for ' + domain)
        sites[domain] = cert[0]
  return sites


def renewal_values(path):
  values = dict(line.split('=', 1) for line in path.read_text().splitlines() if '=' in line)
  return {key.strip(): value.strip() for key, value in values.items()}


def check_site(item):
  domain, cert_path = item
  result = {'domain': domain, 'certificate': cert_path, 'ok': False}
  try:
    expected = fingerprint(host_path(cert_path))
    lineage = lineage_for(cert_path)
    result['lineage'] = lineage
    renewal = LE_ROOT / 'renewal' / (str(lineage) + '.conf')
    if not lineage or not renewal.is_file():
      raise ValueError('No active Certbot renewal configuration')
    values = renewal_values(renewal)
    if values.get('authenticator') == 'manual' and not values.get('manual_auth_hook'):
      raise ValueError('Manual certificate has no automated authentication hook')
    if fingerprint(LE_ROOT / 'live' / lineage / 'fullchain.pem') != expected:
      raise ValueError('Nginx certificate copy differs from Certbot certificate')
    with socket.create_connection((domain, 443), timeout=SETTINGS['socketTimeoutSeconds']) as sock:
      with ssl.create_default_context().wrap_socket(sock, server_hostname=domain) as tls:
        actual = hashlib.sha256(tls.getpeercert(binary_form=True)).hexdigest()
        expires = ssl.cert_time_to_seconds(tls.getpeercert()['notAfter'])
    result['expires'] = datetime.datetime.fromtimestamp(expires, datetime.timezone.utc).isoformat()
    result['daysLeft'] = int((expires - time.time()) / DAY_SECONDS)
    if actual != expected:
      raise ValueError('Public TLS certificate differs from configured certificate')
    if result['daysLeft'] < SETTINGS['minimumDays']:
      raise ValueError('Certificate approaching expiry')
    result['ok'] = True
  except Exception as error:
    result['error'] = str(error)
  return result


def write_json(path, value):
  path.parent.mkdir(parents=True, exist_ok=True)
  with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as temporary:
    json.dump(value, temporary, ensure_ascii=False, indent=2)
    temporary.write('\n')
    name = temporary.name
  os.replace(name, path)


def audit():
  sites = site_inventory(nginx_config())
  if not sites:
    raise ValueError('No configured Starryspark HTTPS sites found')
  with concurrent.futures.ThreadPoolExecutor(max_workers=SETTINGS['workers']) as pool:
    results = list(pool.map(check_site, sorted(sites.items())))
  report = {'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'ok': all(item['ok'] for item in results), 'sites': results}
  write_json(AUDIT_PATH, report)
  print(json.dumps(report, ensure_ascii=False, indent=2))
  if not report['ok']:
    STATE_PATH.unlink(missing_ok=True)
  return 0 if report['ok'] else 1


def matching_key(cert, key):
  public = run('openssl', 'x509', '-in', str(cert), '-pubkey', '-noout')
  converted = subprocess.run(['openssl', 'pkey', '-pubin', '-outform', 'DER'], input=public,
                             check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout
  return converted == run('openssl', 'pkey', '-in', str(key), '-pubout', '-outform', 'DER')


def copy_certificate(lineage, target, domains=()):
  source = LE_ROOT / 'live' / lineage
  if not (source / 'fullchain.pem').exists():
    return
  destination = PROJECT / 'nginx/ssl' / target
  names = ['fullchain.pem', 'privkey.pem']
  if all((destination / name).exists() and (source / name).read_bytes() ==
         (destination / name).read_bytes() for name in names):
    return
  run('openssl', 'x509', '-in', str(source / names[0]), '-noout', '-checkend', '0')
  for domain in domains:
    run('openssl', 'x509', '-in', str(source / names[0]), '-noout', '-checkhost', domain)
  if not matching_key(source / names[0], source / names[1]):
    raise ValueError('Certificate/key mismatch for ' + lineage)
  destination.mkdir(parents=True, exist_ok=True)
  with tempfile.TemporaryDirectory(dir=destination) as temporary:
    for name in names:
      staged = Path(temporary) / name
      shutil.copyfile(source / name, staged)
      staged.chmod(0o600 if name == 'privkey.pem' else 0o644)
    for name in names:
      os.replace(Path(temporary) / name, destination / name)
  print('Updated certificate copy for ' + lineage)


def sync():
  blocks = server_blocks(nginx_config())
  for lineage, target in SETTINGS['copies'].items():
    path = str(Path('/etc/nginx/ssl') / target / 'fullchain.pem')
    domains = [domain for block in blocks if block.get('ssl_certificate') == [path]
               for domain in block.get('server_name', [])
               if '.' in domain and not any(char in domain for char in '*~$')]
    copy_certificate(lineage, target, domains)
  config = nginx_config()
  certificates = sorted({block['ssl_certificate'][0] for block in server_blocks(config)
                         if block.get('ssl_certificate')})
  snapshot = {path: fingerprint(host_path(path)) for path in certificates}
  previous = json.loads(STATE_PATH.read_text()) if STATE_PATH.exists() else None
  if snapshot == previous:
    print('Nginx certificates unchanged; no reload needed')
    return 0
  run('docker', 'exec', 'miniapp-nginx', 'nginx', '-t')
  run('docker', 'exec', 'miniapp-nginx', 'nginx', '-s', 'reload')
  write_json(STATE_PATH, snapshot)
  print('Nginx certificate configuration verified and gracefully reloaded')
  return 0


def archive_inactive_manual(backup):
  config = nginx_config()
  active = {fingerprint(host_path(block['ssl_certificate'][0])) for block in server_blocks(config)
            if block.get('ssl_certificate')}
  for path in sorted((LE_ROOT / 'renewal').glob('*.conf')):
    values = renewal_values(path)
    if values.get('authenticator') != 'manual' or values.get('manual_auth_hook'):
      continue
    cert = LE_ROOT / 'live' / path.stem / 'fullchain.pem'
    if not cert.exists() or fingerprint(cert) in active:
      print('Retained manual renewal requiring operator attention: ' + path.stem)
      continue
    backup.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.move(str(path), str(backup / path.name))
    print('Archived inactive, non-automatable renewal configuration: ' + path.stem)
  return 0


def main():
  mode = sys.argv[1] if len(sys.argv) > 1 else 'audit'
  if mode == 'audit':
    return audit()
  if mode == 'sync':
    return sync()
  if mode == 'archive-inactive-manual' and len(sys.argv) == 3:
    return archive_inactive_manual(Path(sys.argv[2]))
  raise ValueError('Usage: manage.py audit|sync|archive-inactive-manual <backup-directory>')


if __name__ == '__main__':
  try:
    sys.exit(main())
  except Exception as error:
    print('Certificate management failed: ' + str(error), file=sys.stderr)
    sys.exit(1)
