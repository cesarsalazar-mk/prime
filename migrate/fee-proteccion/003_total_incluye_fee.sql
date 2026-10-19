-- total_a_pagar (paquetes) y total/total_cta (documents) pasan a incluir el fee de Protección de Envío.
-- Correr UNA sola vez, justo ANTES del deploy de Packages/Manifest/Invoices, sin facturar ni cargar manifiestos en medio:
-- lo creado con el código nuevo ya trae el fee y se sumaría dos veces.

-- Paquetes pendientes de entregar/facturar. Antes el fee solo se cobraba con seguro_fee_enabled = '1'.
UPDATE paquetes
SET total_a_pagar = ROUND(total_a_pagar + fee_proteccion, 2)
WHERE fee_proteccion > 0
  AND ent_date = '0000-00-00'
  AND (SELECT setting_value FROM settings WHERE setting_key = 'seguro_fee_enabled') = '1';

-- Facturas existentes: el seguro se guardaba aparte en documents.seguro.
UPDATE documents
SET total = ROUND(total + seguro, 2),
    total_cta = ROUND(total_cta + seguro, 2)
WHERE seguro > 0;
