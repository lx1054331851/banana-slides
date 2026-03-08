"""Data source models for DB analysis mode."""
import json
import uuid
from datetime import datetime

from . import db


class DataSource(db.Model):
    """External database connection configuration."""

    __tablename__ = 'data_sources'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(120), nullable=False, unique=True)
    db_type = db.Column(db.String(20), nullable=False, default='mysql')
    host = db.Column(db.String(255), nullable=False)
    port = db.Column(db.Integer, nullable=False, default=3306)
    username = db.Column(db.String(255), nullable=False)
    password = db.Column(db.String(500), nullable=False)
    database_name = db.Column(db.String(255), nullable=False)
    whitelist_tables = db.Column(db.Text, nullable=True)  # JSON array of table names
    er_layout = db.Column(db.Text, nullable=True)  # Persisted ER editor layout JSON
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    projects = db.relationship('Project', back_populates='datasource', lazy='select')
    tables = db.relationship(
        'DataSourceTable',
        back_populates='datasource',
        lazy='select',
        cascade='all, delete-orphan',
    )
    sessions = db.relationship('DbAnalysisSession', back_populates='datasource', lazy='select')
    relations = db.relationship(
        'DataSourceRelation',
        back_populates='datasource',
        lazy='select',
        cascade='all, delete-orphan',
        order_by='DataSourceRelation.created_at',
    )

    def get_whitelist_tables(self) -> list[str]:
        if not self.whitelist_tables:
            return []
        try:
            parsed = json.loads(self.whitelist_tables)
        except Exception:
            return []
        if not isinstance(parsed, list):
            return []
        return [str(item).strip() for item in parsed if str(item).strip()]

    def set_whitelist_tables(self, tables: list[str] | None) -> None:
        if not tables:
            self.whitelist_tables = None
            return
        cleaned = [str(item).strip() for item in tables if str(item).strip()]
        self.whitelist_tables = json.dumps(cleaned, ensure_ascii=False)

    def get_er_layout(self) -> dict | None:
        if not self.er_layout:
            return None
        try:
            parsed = json.loads(self.er_layout)
        except Exception:
            return None
        return parsed if isinstance(parsed, dict) else None

    def set_er_layout(self, layout: dict | None) -> None:
        if not layout:
            self.er_layout = None
            return
        self.er_layout = json.dumps(layout, ensure_ascii=False)

    def to_dict(
        self,
        include_schema: bool = False,
        include_relations: bool = False,
        include_layout: bool = False,
    ) -> dict:
        data = {
            'id': self.id,
            'name': self.name,
            'db_type': self.db_type,
            'host': self.host,
            'port': self.port,
            'username': self.username,
            'database_name': self.database_name,
            'whitelist_tables': self.get_whitelist_tables(),
            'is_active': self.is_active,
            'password_set': bool(self.password),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_layout:
            data['er_layout'] = self.get_er_layout()
        if include_schema:
            data['schema_tables'] = [table.to_dict(include_columns=True) for table in self.tables]
        if include_schema or include_relations:
            data['relations'] = [relation.to_dict() for relation in self.relations]
        return data


class DataSourceTable(db.Model):
    """Imported schema table metadata for a data source."""

    __tablename__ = 'data_source_tables'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    datasource_id = db.Column(db.String(36), db.ForeignKey('data_sources.id'), nullable=False)
    table_name = db.Column(db.String(255), nullable=False)
    table_comment = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    datasource = db.relationship('DataSource', back_populates='tables')
    columns = db.relationship(
        'DataSourceColumn',
        back_populates='table',
        lazy='select',
        cascade='all, delete-orphan',
        order_by='DataSourceColumn.ordinal_position',
    )

    __table_args__ = (
        db.UniqueConstraint('datasource_id', 'table_name', name='uq_data_source_table_name'),
    )

    def to_dict(self, include_columns: bool = False) -> dict:
        data = {
            'id': self.id,
            'datasource_id': self.datasource_id,
            'table_name': self.table_name,
            'table_comment': self.table_comment,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_columns:
            data['columns'] = [column.to_dict() for column in self.columns]
        return data


class DataSourceColumn(db.Model):
    """Imported schema column metadata for a table."""

    __tablename__ = 'data_source_columns'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    table_id = db.Column(db.String(36), db.ForeignKey('data_source_tables.id'), nullable=False)
    column_name = db.Column(db.String(255), nullable=False)
    data_type = db.Column(db.String(100), nullable=False)
    column_type = db.Column(db.String(255), nullable=True)
    ordinal_position = db.Column(db.Integer, nullable=False, default=1)
    is_nullable = db.Column(db.Boolean, nullable=False, default=True)
    is_primary = db.Column(db.Boolean, nullable=False, default=False)
    column_comment = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    table = db.relationship('DataSourceTable', back_populates='columns')

    __table_args__ = (
        db.UniqueConstraint('table_id', 'column_name', name='uq_data_source_column_name'),
    )

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'table_id': self.table_id,
            'column_name': self.column_name,
            'data_type': self.data_type,
            'column_type': self.column_type,
            'ordinal_position': self.ordinal_position,
            'is_nullable': self.is_nullable,
            'is_primary': self.is_primary,
            'column_comment': self.column_comment,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class DataSourceRelation(db.Model):
    """Configured relationship mapping between two datasource tables."""

    __tablename__ = 'data_source_relations'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    datasource_id = db.Column(db.String(36), db.ForeignKey('data_sources.id'), nullable=False)
    source_table = db.Column(db.String(255), nullable=False)
    source_column = db.Column(db.String(255), nullable=False)
    target_table = db.Column(db.String(255), nullable=False)
    target_column = db.Column(db.String(255), nullable=False)
    relation_type = db.Column(db.String(50), nullable=False, default='many_to_one')
    origin = db.Column(db.String(20), nullable=False, default='MANUAL')  # AUTO|MANUAL
    confidence = db.Column(db.Float, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    note = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    datasource = db.relationship('DataSource', back_populates='relations')

    __table_args__ = (
        db.UniqueConstraint(
            'datasource_id',
            'source_table',
            'source_column',
            'target_table',
            'target_column',
            name='uq_data_source_relation_pair',
        ),
    )

    def to_dict(self) -> dict:
        return {
            'id': self.id,
            'datasource_id': self.datasource_id,
            'source_table': self.source_table,
            'source_column': self.source_column,
            'target_table': self.target_table,
            'target_column': self.target_column,
            'relation_type': self.relation_type,
            'origin': self.origin,
            'confidence': self.confidence,
            'is_active': self.is_active,
            'note': self.note,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
