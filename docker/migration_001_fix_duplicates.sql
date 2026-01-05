-- Migration to add unique constraints and clean up duplicates
-- Date: 2025-10-26

-- Step 1: Clean up duplicate agents (keep the most recent one)
WITH numbered_agents AS (
  SELECT id, name, type, 
         ROW_NUMBER() OVER (PARTITION BY name, type ORDER BY created_at DESC) as rn
  FROM druids_core.agents
)
DELETE FROM druids_core.agents 
WHERE id IN (
  SELECT id FROM numbered_agents WHERE rn > 1
);

-- Step 2: Clean up duplicate realms (keep the most recent one)
WITH numbered_realms AS (
  SELECT id, name, 
         ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at DESC) as rn
  FROM druids_core.realms
)
DELETE FROM druids_core.realms 
WHERE id IN (
  SELECT id FROM numbered_realms WHERE rn > 1
);

-- Step 3: Add unique constraints to prevent future duplicates
ALTER TABLE druids_core.agents 
ADD CONSTRAINT uk_agents_name_type UNIQUE (name, type);

ALTER TABLE druids_core.realms 
ADD CONSTRAINT uk_realms_name UNIQUE (name);

-- Step 4: Create a function to prevent duplicate submissions
CREATE OR REPLACE FUNCTION prevent_duplicate_agent_creation()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if an agent with the same name and type already exists
  IF EXISTS (
    SELECT 1 FROM druids_core.agents 
    WHERE name = NEW.name AND type = NEW.type AND id != NEW.id
  ) THEN
    RAISE EXCEPTION 'Agent with name "%" and type "%" already exists', NEW.name, NEW.type;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create a function to prevent duplicate realm creation
CREATE OR REPLACE FUNCTION prevent_duplicate_realm_creation()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if a realm with the same name already exists
  IF EXISTS (
    SELECT 1 FROM druids_core.realms 
    WHERE name = NEW.name AND id != NEW.id
  ) THEN
    RAISE EXCEPTION 'Realm with name "%" already exists', NEW.name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create triggers
DROP TRIGGER IF EXISTS trigger_prevent_duplicate_agents ON druids_core.agents;
CREATE TRIGGER trigger_prevent_duplicate_agents
  BEFORE INSERT OR UPDATE ON druids_core.agents
  FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_agent_creation();

DROP TRIGGER IF EXISTS trigger_prevent_duplicate_realms ON druids_core.realms;
CREATE TRIGGER trigger_prevent_duplicate_realms
  BEFORE INSERT OR UPDATE ON druids_core.realms
  FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_realm_creation();