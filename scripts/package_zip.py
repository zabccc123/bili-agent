import sys
import zipfile
from pathlib import Path

source = Path(sys.argv[1]).resolve(strict=True)
destination = Path(sys.argv[2]).resolve()
if source.name != 'marketplace' or source.parent.name != 'artifacts' or destination.parent != source.parent:
    raise SystemExit('Unexpected package paths')
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for item in sorted(source.rglob('*')):
        if item.is_symlink():
            if '.bin' in item.relative_to(source).parts:
                continue  # Runtime uses node with an explicit CLI path.
            raise SystemExit('Unexpected symlink in plugin archive')
        if item.is_file():
            archive.write(item, item.relative_to(source))
print(f'Packaged {destination.name}: {destination.stat().st_size} bytes')
