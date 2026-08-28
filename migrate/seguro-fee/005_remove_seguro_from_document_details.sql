-- Seguro is stored on documents.seguro, not as a line item
DELETE FROM document_details
WHERE cod_service = 10 OR description = 'Seguro';
