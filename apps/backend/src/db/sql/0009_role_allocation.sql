-- % de asignación por rol (spec pedido por usuario): no siempre un rol está dedicado al 100% del
-- proyecto — debe considerarse tanto en el cálculo de horas/costo (roles sin datos históricos se
-- estiman a partir de la duración probable × horas/semana estándar × este %) como en la duración
-- (un rol con baja asignación puede necesitar más semanas de calendario para completar sus horas).
ALTER TABLE cost_rates ADD COLUMN IF NOT EXISTS allocation_pct numeric NOT NULL DEFAULT 1;
