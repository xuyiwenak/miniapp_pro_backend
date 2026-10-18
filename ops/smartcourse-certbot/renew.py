#!/usr/bin/python3
"""Run the installed Certbot using short-lived, TLS-verified HTTP connections."""
import sys

import requests


class ShortConnectionSession(requests.Session):
  def request(self, method, url, **kwargs):
    headers = dict(kwargs.get('headers') or {})
    headers['Connection'] = 'close'
    kwargs['headers'] = headers
    return super().request(method, url, **kwargs)


# Certbot's ACME client creates requests.Session instances. Keep all other
# request options, including TLS verification and timeouts, unchanged.
requests.Session = ShortConnectionSession

from certbot.main import main

if __name__ == '__main__':
  sys.exit(main(sys.argv[1:]))
