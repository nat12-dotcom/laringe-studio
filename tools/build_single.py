"""Genera dist/LaringeStudio.html: la app completa en un solo archivo (doble clic para abrir)."""
import base64, pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
css = (root / 'css/style.css').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>')
for name in ['analysis', 'voice', 'head', 'music', 'remix', 'sfx', 'app']:
    js = (root / f'js/{name}.js').read_text(encoding='utf-8')
    html = html.replace(f'<script src="js/{name}.js"></script>', '<script>\n' + js + '\n</script>')
icon = base64.b64encode((root / 'icons/icon-192.png').read_bytes()).decode()
html = re.sub(r'<link rel="manifest"[^>]*>\n', '', html)
html = re.sub(r'<link rel="icon"[^>]*>', f'<link rel="icon" type="image/png" href="data:image/png;base64,{icon}">', html)
html = re.sub(r'<link rel="apple-touch-icon"[^>]*>\n', '', html)
out = root / 'dist'
out.mkdir(exist_ok=True)
(out / 'LaringeStudio.html').write_text(html, encoding='utf-8')
print('ok', len(html) // 1024, 'KB')
