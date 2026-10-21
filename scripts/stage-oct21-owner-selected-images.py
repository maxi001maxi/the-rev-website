"""Stage only the Owner-selected immutable bytes. Never rewrite independent QC.

No generator, DB client, Bridge call, readiness promotion, or publishing exists here.
The Owner's image selection permits asset delivery; it does not invent QC PASS.
"""
import hashlib
import json
import pathlib
import struct
import sys
import tarfile

ROOT = 'editorial/prepublication/2026-10-21-evening-strength-sleep'
VERSION = 'reference-v082-evolgear-japanese-night-r5-standing-layout-qc-20261020'
SLUG = 'night-workout-sleep-timing-intensity'
QA_SHA = '007f22e145d9bb56a64981c5344435274d3ceb7ce752678868b299d67f565494'
ASSETS = {
    f'assets/images/editorial-generated/{SLUG}-{VERSION}-scene.png': ('6f3b19d4a15565bce5d5399a6e85cbb0443b410285911d6c2f94188975fb70b7', (1024, 1536)),
    f'assets/images/blog/thumb-{SLUG}-{VERSION}.jpg': ('83ffff6b1d2cc26d817e6420896fcc69060af02fd8359dfaebfbc83eaee7a4e1', (1200, 675)),
    f'assets/images/blog/og/og-{SLUG}-{VERSION}.jpg': ('c3124f7d6571a53cef13880ace469966b8a918848da4065db2e522d552c9358b', (1200, 630)),
    f'assets/images/gbp/gbp-{SLUG}-{VERSION}.jpg': ('3ccdf051b1c0d042c9dd9ce0b6ad6ed9b69a811b579e3d736cc7a5fdfbc77ba3', (1200, 900)),
}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def dimensions(data):
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return struct.unpack('>II', data[16:24])
    if data[:2] != b'\xff\xd8':
        raise ValueError('IMAGE_TYPE_INVALID')
    offset = 2
    while offset < len(data):
        if data[offset] != 255:
            raise ValueError('JPEG_MARKER_INVALID')
        while data[offset] == 255:
            offset += 1
        marker = data[offset]
        offset += 1
        size = int.from_bytes(data[offset:offset + 2], 'big')
        if marker in (192, 193, 194):
            height, width = struct.unpack('>HH', data[offset + 3:offset + 7])
            return width, height
        if size < 2:
            raise ValueError('JPEG_SEGMENT_INVALID')
        offset += size
    raise ValueError('IMAGE_DIMENSIONS_MISSING')

def stage(archive):
    approval_path = pathlib.Path(ROOT, 'OWNER_IMAGE_SELECTION.json')
    approval = json.loads(approval_path.read_text())
    if (approval['content_id'] != 'BLOG-20261021-4ac8fd' or
        approval['draft_id'] != 'ac869d7c-c6b8-4d15-b3a0-e8b6c0963f47' or
        approval['asset_version'] != VERSION or approval['owner_selected'] is not True or
        approval['independent_qc_pass'] is not False or approval['publish_authorized'] is not False or
        approval['gbp_post_authorized'] is not False or
        approval['assets'] != {p: h for p, (h, _) in ASSETS.items()}):
        raise ValueError('OWNER_SELECTION_SCOPE_DRIFT')
    qa_path = pathlib.Path(ROOT, 'image-layout-r5b/IMAGE_INDEPENDENT_QC.json')
    if digest(qa_path.read_bytes()) != QA_SHA or json.loads(qa_path.read_text())['pass'] is not False:
        raise ValueError('ORIGINAL_QC_DRIFT')
    verified = []
    # Read named regular files only. Never extract arbitrary tar paths or links.
    with tarfile.open(archive, 'r:gz') as tar:
        for path, (expected, expected_size) in ASSETS.items():
            member = tar.getmember(f'.operator-rejected-evidence/{SLUG}/{VERSION}/{path}')
            if not member.isfile() or member.size > 5000000:
                raise ValueError('ARTIFACT_MEMBER_INVALID')
            data = tar.extractfile(member).read()
            if digest(data) != expected or dimensions(data) != expected_size:
                raise ValueError('SELECTED_IMAGE_BYTE_OR_DIMENSION_DRIFT')
            target = pathlib.Path(path)
            if target.exists() and digest(target.read_bytes()) != expected:
                raise ValueError('EXISTING_ASSET_REPLACEMENT_FORBIDDEN')
            verified.append((path, data, expected, expected_size))
    # All bytes pass before any asset write.
    for path, data, _, _ in verified:
        target = pathlib.Path(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    report_path = f'{ROOT}/OWNER_SELECTED_ASSET_STAGING.json'
    report = dict(content_id=approval['content_id'], draft_id=approval['draft_id'],
        asset_version=VERSION, status='OWNER_SELECTED_ASSETS_PREPARED_QC_HOLD',
        owner_selected=True, independent_qc_pass=False, image_ready=False,
        review_ready=False, published=False, gbp_posted=False,
        generation_calls=0, independent_qc_calls=0, xserver_verified=False,
        original_qc_sha256=QA_SHA, source_artifact_id=12256945070,
        assets=[dict(path=p, sha256=h, width=s[0], height=s[1], bytes=len(d)) for p,d,h,s in verified])
    pathlib.Path(report_path).write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    pathlib.Path('.oct21-owner-image-paths').write_text('\n'.join(p for p in ASSETS if p.endswith('.jpg'))+'\n')
    pathlib.Path('.oct21-owner-staging-paths').write_text('\n'.join([*ASSETS, report_path])+'\n')
    print(json.dumps(dict(status=report['status'], verified_images=len(verified), paid_calls=0)))

if __name__ == '__main__':
    stage(sys.argv[1])
