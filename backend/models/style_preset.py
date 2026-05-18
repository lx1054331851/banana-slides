"""Style preset model (global library)"""
import json
import uuid
from datetime import datetime
from . import db


class StylePreset(db.Model):
    """
    StylePreset model - stores finalized style JSON that can be directly applied to projects
    """
    __tablename__ = 'style_presets'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(200), nullable=True)
    style_json = db.Column(db.Text, nullable=False)  # JSON text
    preview_images_json = db.Column(db.Text, nullable=True)  # JSON: preview slot URLs
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    @staticmethod
    def _normalize_preview_images(data):
        if not isinstance(data, dict):
            return {}
        return {
            str(k): str(v or '')
            for k, v in data.items()
            if isinstance(k, str) and k.strip()
        }

    def get_preview_images(self):
        if not self.preview_images_json:
            return self._normalize_preview_images({})
        try:
            parsed = json.loads(self.preview_images_json)
        except Exception:
            parsed = {}
        return self._normalize_preview_images(parsed)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'style_json': self.style_json,
            'preview_images': self.get_preview_images(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<StylePreset {self.id}: {self.name}>'
