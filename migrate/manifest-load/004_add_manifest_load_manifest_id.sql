ALTER TABLE manifest_load
  ADD COLUMN manifest_id VARCHAR(100) NULL;

ALTER TABLE manifest_load_detail
  ADD COLUMN manifest_id INT NULL;
