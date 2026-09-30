-- Fee de proteccion por paquete: (dai + total_iva) * seguro_fee% (settings), calculado cuando se llenan dai/iva
ALTER TABLE paquetes
ADD COLUMN fee_proteccion DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total_iva;
