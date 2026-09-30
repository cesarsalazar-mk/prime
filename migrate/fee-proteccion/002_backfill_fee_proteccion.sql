-- OPCIONAL: calcula fee_proteccion con el % actual para paquetes pendientes de entregar/facturar.
-- Se calcula con seguro_fee (independiente de seguro_fee_enabled). Correr una sola vez despues de 001.
UPDATE paquetes
SET fee_proteccion = ROUND(
  (IFNULL(dai, 0) + IFNULL(total_iva, 0)) *
  IFNULL((SELECT setting_value FROM settings WHERE setting_key = 'seguro_fee'), 0) / 100, 2)
WHERE ent_date = '0000-00-00'
  AND status NOT IN ('Registrado', 'On Hold', 'Entregado', 'En Warehouse');
