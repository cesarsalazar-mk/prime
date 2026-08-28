-- Persist Seguro fee amount on each invoice
ALTER TABLE documents
ADD COLUMN seguro DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER discount;
