import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('certificate_manager', Path(__file__).with_name('manage.py'))
MANAGER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MANAGER)


class CertificateManagementTests(unittest.TestCase):
  @classmethod
  def setUpClass(cls):
    cls.directory = tempfile.TemporaryDirectory()
    cls.root = Path(cls.directory.name)
    for name in ['first', 'second']:
      target = cls.root / name
      target.mkdir()
      subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
                      '-subj', '/CN=fixture.example', '-keyout', str(target / 'privkey.pem'),
                      '-out', str(target / 'fullchain.pem')], check=True,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

  @classmethod
  def tearDownClass(cls):
    cls.directory.cleanup()

  def test_inventory_ignores_http_and_nested_directives(self):
    config = '''server { listen 80; server_name ignore.starryspark.com.cn;}
    server { listen 443 ssl; server_name a.starryspark.com.cn b.starryspark.com.cn;
      ssl_certificate /etc/letsencrypt/live/a/fullchain.pem;
      location / { set $example "server_name fake.starryspark.com.cn"; }
    }'''
    self.assertEqual(MANAGER.site_inventory(config), {
      'a.starryspark.com.cn': '/etc/letsencrypt/live/a/fullchain.pem',
      'b.starryspark.com.cn': '/etc/letsencrypt/live/a/fullchain.pem',
    })
    duplicate = 'server {server_name a.starryspark.com.cn;ssl_certificate /different.pem;}'
    with self.assertRaises(ValueError):
      MANAGER.site_inventory(config + duplicate)

  def test_certificate_pair_is_verified_before_replacing_copy(self):
    with tempfile.TemporaryDirectory() as temp:
      root = Path(temp)
      source = root / 'le/live/fixture'
      source.mkdir(parents=True)
      for name in ['fullchain.pem', 'privkey.pem']:
        shutil.copyfile(self.root / 'first' / name, source / name)
      with patch.object(MANAGER, 'LE_ROOT', root / 'le'), patch.object(MANAGER, 'PROJECT', root):
        MANAGER.copy_certificate('fixture', 'fixture-copy')
        destination = root / 'nginx/ssl/fixture-copy/fullchain.pem'
        previous = destination.read_bytes()
        self.assertEqual((destination.parent / 'privkey.pem').stat().st_mode & 0o777, 0o600)
        shutil.copyfile(self.root / 'second/privkey.pem', source / 'privkey.pem')
        with self.assertRaises(ValueError):
          MANAGER.copy_certificate('fixture', 'fixture-copy')
        self.assertEqual(destination.read_bytes(), previous)

  def test_inactive_manual_archive_preserves_active_certificates_and_keys(self):
    with tempfile.TemporaryDirectory() as temp:
      root = Path(temp)
      renewal = root / 'renewal'
      renewal.mkdir()
      for name, fixture in [('active', 'first'), ('inactive', 'second')]:
        source = root / 'live' / name
        source.mkdir(parents=True)
        for filename in ['fullchain.pem', 'privkey.pem']:
          shutil.copyfile(self.root / fixture / filename, source / filename)
        (renewal / (name + '.conf')).write_text('authenticator = manual\n')
      config = f'server {{ ssl_certificate {root}/live/active/fullchain.pem; }}'
      with patch.object(MANAGER, 'LE_ROOT', root), patch.object(MANAGER, 'nginx_config', return_value=config):
        MANAGER.archive_inactive_manual(root / 'backup')
      self.assertTrue((renewal / 'active.conf').exists())
      self.assertFalse((renewal / 'inactive.conf').exists())
      self.assertTrue((root / 'backup/inactive.conf').exists())
      self.assertTrue((root / 'live/inactive/privkey.pem').exists())


if __name__ == '__main__':
  unittest.main()
