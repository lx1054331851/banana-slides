from pathlib import Path


def _create_source_preview(app, project_id: str, rec_id: str, filename: str = "cover.png") -> str:
    upload_root = Path(app.config['UPLOAD_FOLDER'])
    source_dir = upload_root / project_id / "style-previews" / rec_id
    source_dir.mkdir(parents=True, exist_ok=True)
    source_file = source_dir / filename
    source_file.write_bytes(b"fake-image-bytes")
    return f"/files/{project_id}/style-previews/{rec_id}/{filename}"


def test_create_style_preset_with_preview_images(client, app):
    cover_url = _create_source_preview(app, "proj_a", "rec_a", "cover.png")
    toc_url = _create_source_preview(app, "proj_a", "rec_a", "toc.png")
    detail_url = _create_source_preview(app, "proj_a", "rec_a", "detail.png")
    ending_url = _create_source_preview(app, "proj_a", "rec_a", "ending.png")

    response = client.post('/api/style-presets', json={
        'name': 'Test preset',
        'style_json': '{"color":"blue"}',
        'preview_images': {
            'cover_url': cover_url,
            'toc_url': toc_url,
            'detail_url': detail_url,
            'ending_url': ending_url,
        }
    })

    assert response.status_code == 201
    payload = response.get_json()
    assert payload['success'] is True
    data = payload['data']
    assert data['id']
    preview_images = data.get('preview_images') or {}
    assert preview_images.get('cover_url', '').startswith(f"/files/style-presets/{data['id']}/")
    assert preview_images.get('toc_url', '').startswith(f"/files/style-presets/{data['id']}/")
    assert preview_images.get('detail_url', '').startswith(f"/files/style-presets/{data['id']}/")
    assert preview_images.get('ending_url', '').startswith(f"/files/style-presets/{data['id']}/")

    preset_dir = Path(app.config['UPLOAD_FOLDER']) / "style-presets" / data['id']
    assert preset_dir.exists()
    assert len(list(preset_dir.glob("*"))) == 4


def test_create_style_preset_rejects_invalid_preview_source(client):
    response = client.post('/api/style-presets', json={
        'name': 'Invalid source preset',
        'style_json': '{"a":1}',
        'preview_images': {
            'cover_url': '/files/materials/not_allowed.png'
        }
    })
    assert response.status_code == 400
    payload = response.get_json()
    assert payload['success'] is False


def test_delete_style_preset_cleans_preview_files(client, app):
    cover_url = _create_source_preview(app, "proj_b", "rec_b", "cover.png")
    create_resp = client.post('/api/style-presets', json={
        'name': 'Delete preset',
        'style_json': '{"a":1}',
        'preview_images': {
            'cover_url': cover_url
        }
    })
    assert create_resp.status_code == 201
    preset_id = create_resp.get_json()['data']['id']

    preset_dir = Path(app.config['UPLOAD_FOLDER']) / "style-presets" / preset_id
    assert preset_dir.exists()

    delete_resp = client.delete(f'/api/style-presets/{preset_id}')
    assert delete_resp.status_code == 200
    payload = delete_resp.get_json()
    assert payload['success'] is True
    assert not preset_dir.exists()
