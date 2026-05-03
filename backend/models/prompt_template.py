"""Prompt template override model."""
from datetime import datetime, timezone
from . import db


class PromptTemplate(db.Model):
    """Store editable prompt template overrides for registered prompt stages."""
    __tablename__ = 'prompt_templates'

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False, index=True)
    mode = db.Column(db.String(50), nullable=False, index=True)
    stage = db.Column(db.String(50), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    default_content = db.Column(db.Text, nullable=False, default='')
    custom_content = db.Column(db.Text, nullable=True)
    enabled = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self, effective_content=None):
        """Serialize prompt template state for API responses."""
        custom = self.custom_content or ''
        default = self.default_content or ''
        effective = effective_content if effective_content is not None else (
            custom if self.enabled and custom.strip() else default
        )
        return {
            'id': self.id,
            'key': self.key,
            'mode': self.mode,
            'stage': self.stage,
            'title': self.title,
            'description': self.description or '',
            'default_content': default,
            'custom_content': custom,
            'effective_content': effective,
            'enabled': bool(self.enabled),
            'is_customized': bool(custom.strip()),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
