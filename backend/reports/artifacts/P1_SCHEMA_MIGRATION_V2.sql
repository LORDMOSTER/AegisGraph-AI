-- AegisGraph AI: Phase 1 Multi-Tenant Schema (PostgreSQL)

CREATE TYPE roleenum AS ENUM ('SUPER_ADMIN', 'PLANT_ADMIN', 'OPERATOR');
CREATE TYPE sessionstatus AS ENUM ('ACTIVE', 'EXPIRED', 'CLOSED');
CREATE TABLE companies (
	company_code VARCHAR(32) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX ix_companies_id ON companies (id);
CREATE UNIQUE INDEX ix_companies_company_code ON companies (company_code);
CREATE TABLE users (
	company_id UUID NOT NULL, 
	employee_code VARCHAR(64) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	role roleenum NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uix_company_employee UNIQUE (company_id, employee_code), 
	FOREIGN KEY(company_id) REFERENCES companies (id) ON DELETE CASCADE
);
CREATE INDEX ix_users_company_id ON users (company_id);
CREATE INDEX ix_users_id ON users (id);
CREATE TABLE assessment_sessions (
	company_id UUID NOT NULL, 
	session_pin_hash VARCHAR(255) NOT NULL, 
	blueprint_manifest JSONB NOT NULL, 
	pass_threshold_percentage FLOAT NOT NULL, 
	status sessionstatus NOT NULL, 
	expires_at TIMESTAMP WITH TIME ZONE, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(company_id) REFERENCES companies (id) ON DELETE CASCADE
);
CREATE INDEX ix_assessment_sessions_id ON assessment_sessions (id);
CREATE INDEX ix_assessment_sessions_session_pin_hash ON assessment_sessions (session_pin_hash);
CREATE INDEX ix_assessment_sessions_company_id ON assessment_sessions (company_id);
CREATE TABLE audit_logs (
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	company_id UUID, 
	actor_id UUID, 
	action VARCHAR(64) NOT NULL, 
	entity_type VARCHAR(64) NOT NULL, 
	entity_id VARCHAR(64) NOT NULL, 
	payload_snapshot JSONB, 
	id UUID NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(company_id) REFERENCES companies (id) ON DELETE SET NULL
);
CREATE INDEX ix_audit_logs_id ON audit_logs (id);
CREATE INDEX ix_audit_logs_actor_id ON audit_logs (actor_id);
CREATE INDEX ix_audit_logs_company_id ON audit_logs (company_id);
CREATE TABLE test_attempts (
	session_id UUID NOT NULL, 
	user_id UUID NOT NULL, 
	raw_score FLOAT NOT NULL, 
	percentage FLOAT NOT NULL, 
	grade VARCHAR(8) NOT NULL, 
	anomaly_score FLOAT NOT NULL, 
	verified_responses JSONB NOT NULL, 
	completed_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	updated_at TIMESTAMP WITH TIME ZONE NOT NULL, 
	id UUID NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(session_id) REFERENCES assessment_sessions (id) ON DELETE CASCADE, 
	FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
);
CREATE INDEX ix_test_attempts_id ON test_attempts (id);
CREATE INDEX ix_test_attempts_user_id ON test_attempts (user_id);
CREATE INDEX ix_test_attempts_session_id ON test_attempts (session_id);
