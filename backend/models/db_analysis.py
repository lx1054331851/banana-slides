"""DB analysis workflow models."""
import json
import uuid
from datetime import datetime

from . import db


class DbAnalysisSession(db.Model):
    """Top-level analysis session for a project."""

    __tablename__ = 'db_analysis_sessions'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = db.Column(db.String(36), db.ForeignKey('projects.id'), nullable=False)
    datasource_id = db.Column(db.String(36), db.ForeignKey('data_sources.id'), nullable=False)
    business_context = db.Column(db.Text, nullable=False)
    analysis_goal = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(30), nullable=False, default='ACTIVE')  # ACTIVE|STOPPED|FAILED
    started_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    ended_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = db.relationship('Project', backref=db.backref('db_analysis_sessions', lazy='select'))
    datasource = db.relationship('DataSource', back_populates='sessions')
    rounds = db.relationship(
        'DbAnalysisRound',
        back_populates='session',
        lazy='select',
        cascade='all, delete-orphan',
        order_by='DbAnalysisRound.round_number',
    )

    def to_dict(self, include_rounds: bool = False) -> dict:
        data = {
            'id': self.id,
            'project_id': self.project_id,
            'datasource_id': self.datasource_id,
            'business_context': self.business_context,
            'analysis_goal': self.analysis_goal,
            'status': self.status,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'ended_at': self.ended_at.isoformat() if self.ended_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_rounds:
            data['rounds'] = [round_obj.to_dict(include_interactions=True) for round_obj in self.rounds]
        return data


class DbAnalysisRound(db.Model):
    """One analysis cycle: SQL -> result -> finding -> interaction schema."""

    __tablename__ = 'db_analysis_rounds'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = db.Column(db.String(36), db.ForeignKey('db_analysis_sessions.id'), nullable=False)
    round_number = db.Column(db.Integer, nullable=False)
    page_title = db.Column(db.String(300), nullable=False)
    sql_draft = db.Column(db.Text, nullable=True)
    sql_final = db.Column(db.Text, nullable=False)
    sql_rewrite_reason = db.Column(db.Text, nullable=True)
    query_result_json = db.Column(db.Text, nullable=True)  # {columns:[], rows:[]}
    query_error = db.Column(db.Text, nullable=True)
    key_findings = db.Column(db.Text, nullable=True)
    next_dimension_candidates = db.Column(db.Text, nullable=True)  # JSON array[str]
    interaction_schema = db.Column(db.Text, nullable=True)  # JSON array[question]
    interaction_answers = db.Column(db.Text, nullable=True)  # JSON object
    status = db.Column(db.String(30), nullable=False, default='WAITING_INPUT')  # WAITING_INPUT|READY|FAILED
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    session = db.relationship('DbAnalysisSession', back_populates='rounds')
    interactions = db.relationship(
        'DbInteraction',
        back_populates='round',
        lazy='select',
        cascade='all, delete-orphan',
        order_by='DbInteraction.created_at',
    )

    __table_args__ = (
        db.UniqueConstraint('session_id', 'round_number', name='uq_db_analysis_round_number'),
    )

    @staticmethod
    def _loads(raw, default):
        if not raw:
            return default
        try:
            parsed = json.loads(raw)
            return parsed
        except Exception:
            return default

    def get_query_result(self) -> dict:
        return self._loads(self.query_result_json, {'columns': [], 'rows': []})

    def set_query_result(self, value: dict | None) -> None:
        self.query_result_json = json.dumps(value or {'columns': [], 'rows': []}, ensure_ascii=False)

    def get_next_dimension_candidates(self) -> list[str]:
        parsed = self._loads(self.next_dimension_candidates, [])
        if not isinstance(parsed, list):
            return []
        return [str(item) for item in parsed if str(item).strip()]

    def set_next_dimension_candidates(self, value: list[str] | None) -> None:
        self.next_dimension_candidates = json.dumps(value or [], ensure_ascii=False)

    def get_interaction_schema(self) -> list[dict]:
        parsed = self._loads(self.interaction_schema, [])
        if not isinstance(parsed, list):
            return []
        return [item for item in parsed if isinstance(item, dict)]

    def set_interaction_schema(self, value: list[dict] | None) -> None:
        self.interaction_schema = json.dumps(value or [], ensure_ascii=False)

    def get_interaction_answers(self) -> dict:
        parsed = self._loads(self.interaction_answers, {})
        if not isinstance(parsed, dict):
            return {}
        return parsed

    def set_interaction_answers(self, value: dict | None) -> None:
        self.interaction_answers = json.dumps(value or {}, ensure_ascii=False)

    def to_dict(self, include_interactions: bool = False) -> dict:
        data = {
            'id': self.id,
            'session_id': self.session_id,
            'round_number': self.round_number,
            'page_title': self.page_title,
            'sql_draft': self.sql_draft,
            'sql_final': self.sql_final,
            'sql_rewrite_reason': self.sql_rewrite_reason,
            'query_result': self.get_query_result(),
            'query_error': self.query_error,
            'key_findings': self.key_findings,
            'next_dimension_candidates': self.get_next_dimension_candidates(),
            'interaction_schema': self.get_interaction_schema(),
            'interaction_answers': self.get_interaction_answers(),
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_interactions:
            data['interactions'] = [interaction.to_dict() for interaction in self.interactions]
        return data


class DbInteraction(db.Model):
    """One user answer submission payload for a round."""

    __tablename__ = 'db_interactions'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    round_id = db.Column(db.String(36), db.ForeignKey('db_analysis_rounds.id'), nullable=False)
    payload_json = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    round = db.relationship('DbAnalysisRound', back_populates='interactions')

    def get_payload(self) -> dict:
        try:
            parsed = json.loads(self.payload_json)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
        return {}

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'round_id': self.round_id,
            'payload': self.get_payload(),
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
