"""Style template model (global library)"""
import uuid
from datetime import datetime
from . import db


class StyleTemplate(db.Model):
    """
    StyleTemplate model - stores user-provided style template JSON skeletons
    """
    __tablename__ = 'style_templates'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(200), nullable=True)
    template_json = db.Column(db.Text, nullable=False)  # JSON skeleton text
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'template_json': self.template_json,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f'<StyleTemplate {self.id}: {self.name}>'

