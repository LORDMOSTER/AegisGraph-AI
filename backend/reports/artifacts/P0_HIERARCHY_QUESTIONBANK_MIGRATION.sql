-- AegisGraph AI Phase 0: Hierarchy and Question Bank Migration
-- Generated for PostgreSQL

BEGIN;

CREATE TABLE manuals (
    id UUID PRIMARY KEY,
    company_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    version VARCHAR(32) DEFAULT '1.0' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    FOREIGN KEY(company_id) REFERENCES companies (id) ON DELETE CASCADE
);
CREATE INDEX ix_manuals_company_id ON manuals (company_id);
CREATE INDEX ix_manuals_id ON manuals (id);

CREATE TABLE sections (
    id UUID PRIMARY KEY,
    manual_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64),
    order_index INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    FOREIGN KEY(manual_id) REFERENCES manuals (id) ON DELETE CASCADE
);
CREATE INDEX ix_sections_manual_id ON sections (manual_id);
CREATE INDEX ix_sections_id ON sections (id);

CREATE TABLE subcategories (
    id UUID PRIMARY KEY,
    section_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    FOREIGN KEY(section_id) REFERENCES sections (id) ON DELETE CASCADE
);
CREATE INDEX ix_subcategories_section_id ON subcategories (section_id);
CREATE INDEX ix_subcategories_id ON subcategories (id);

CREATE TABLE rules (
    id UUID PRIMARY KEY,
    subcategory_id UUID NOT NULL,
    rule_code VARCHAR(64) NOT NULL,
    text TEXT NOT NULL,
    risk_score INTEGER NOT NULL CHECK (risk_score >= 1 AND risk_score <= 10),
    cognitive_level VARCHAR(32) NOT NULL,
    response_time_sec INTEGER DEFAULT 60 NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    FOREIGN KEY(subcategory_id) REFERENCES subcategories (id) ON DELETE CASCADE
);
CREATE INDEX ix_rules_subcategory_id ON rules (subcategory_id);
CREATE INDEX ix_rules_id ON rules (id);
CREATE INDEX ix_rules_subcat_active ON rules (subcategory_id, is_active);
CREATE INDEX ix_rules_risk_cog ON rules (risk_score, cognitive_level);

CREATE TYPE questionstatus_enum AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

CREATE TABLE question_bank (
    id UUID PRIMARY KEY,
    rule_id UUID NOT NULL,
    stem TEXT NOT NULL,
    options JSONB NOT NULL,
    correct_answer VARCHAR(8) NOT NULL,
    explanation TEXT,
    bloom_level VARCHAR(32) NOT NULL,
    status questionstatus_enum DEFAULT 'DRAFT' NOT NULL,
    grounding_verified BOOLEAN DEFAULT false NOT NULL,
    reviewer_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    FOREIGN KEY(rule_id) REFERENCES rules (id) ON DELETE CASCADE
);
CREATE INDEX ix_question_bank_rule_id ON question_bank (rule_id);
CREATE INDEX ix_question_bank_status ON question_bank (status);
CREATE INDEX ix_question_bank_id ON question_bank (id);

COMMIT;
