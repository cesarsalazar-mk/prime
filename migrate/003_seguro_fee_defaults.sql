-- Default Seguro fee value (0) and disabled by default
INSERT INTO settings (setting_key, setting_value, updated_at, updated_by)
VALUES ('seguro_fee', '0', NOW(), 'system')
ON DUPLICATE KEY UPDATE setting_key = setting_key;

INSERT INTO settings (setting_key, setting_value, updated_at, updated_by)
VALUES ('seguro_fee_enabled', '0', NOW(), 'system')
ON DUPLICATE KEY UPDATE setting_key = setting_key;
