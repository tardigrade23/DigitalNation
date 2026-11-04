"""Bundle index.html + style.css + game.js into one self-contained HTML body.

The output omits <!doctype>/<html>/<head>/<body> so it can be published as a
claude.ai Artifact (which supplies its own skeleton).

Usage: python3 tools/build_single_file.py OUTPUT.html
"""
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'style.css').read_text(encoding='utf-8')
js = (root / 'game.js').read_text(encoding='utf-8')

head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
keep = [m.group(0) for m in re.finditer(r'<title>.*?</title>|<meta name="(?:claude:viewport-fit-sides|theme-color)"[^>]*>|<link rel="(?:preconnect|stylesheet)" href="https://fonts[^>]*>', head)]
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
# The artifact host blocks requests to Supabase, so accounts are left out of the single-file build.
body = body.replace('<script src="vendor/supabase.js"></script>\n', '')
body = body.replace('<script src="game.js"></script>', '<script>\n' + js + '\n</script>')

out = '\n'.join(keep) + '\n<style>\n' + css + '\n</style>\n' + body
pathlib.Path(sys.argv[1]).write_text(out, encoding='utf-8')
print(f'wrote {sys.argv[1]} ({len(out) // 1024} KB)')
