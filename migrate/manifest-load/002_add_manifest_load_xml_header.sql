ALTER TABLE manifest_load
  ADD COLUMN tipo_de_cambio DECIMAL(12,6) NULL,
  ADD COLUMN sub_total DECIMAL(12,2) NULL,
  ADD COLUMN monto_iva DECIMAL(12,2) NULL,
  ADD COLUMN monto_total DECIMAL(12,2) NULL,
  ADD COLUMN resultado_analisis_riesgo VARCHAR(150) NULL;
