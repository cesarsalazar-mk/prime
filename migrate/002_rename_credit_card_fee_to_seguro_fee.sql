-- Rename credit_card_fee setting key to seguro_fee (if it exists)
UPDATE settings
SET setting_key = 'seguro_fee'
WHERE setting_key = 'credit_card_fee';
