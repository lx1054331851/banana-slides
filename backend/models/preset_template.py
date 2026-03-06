"""
Preset Template model - stores globally managed preset templates
"""
import uuid
from datetime import datetime
from . import db


class PresetTemplate(db.Model):
    """
    Preset Template model - represents a globally managed preset template image
    """
    __tablename__ = 'preset_templates'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(200), nullable=True)
    file_path = db.Column(db.String(500), nullable=False)
    thumb_path = db.Column(db.String(500), nullable=True)
    file_size = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        if self.thumb_path:
            thumb_url = f'/files/preset-templates/{self.id}/{self.thumb_path.split("/")[-1]}'
        else:
            thumb_url = None

        return {
            'template_id': self.id,
            'name': self.name,
            'template_image_url': f'/files/preset-templates/{self.id}/{self.file_path.split("/")[-1]}',
            'thumb_url': thumb_url,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<PresetTemplate {self.id}: {self.name or "Unnamed"}>'
