-- Enable RLS on existing tables
ALTER TABLE public.usinas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leituras_diarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marcas_inversores ENABLE ROW LEVEL SECURITY;

-- RLS policies for usinas - authenticated users can read
CREATE POLICY "Authenticated users can view usinas"
ON public.usinas
FOR SELECT
TO authenticated
USING (true);

-- Admins and operators can modify usinas
CREATE POLICY "Admins and operators can insert usinas"
ON public.usinas
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operador'));

CREATE POLICY "Admins and operators can update usinas"
ON public.usinas
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operador'));

CREATE POLICY "Admins can delete usinas"
ON public.usinas
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies for leituras_diarias - authenticated users can read
CREATE POLICY "Authenticated users can view leituras_diarias"
ON public.leituras_diarias
FOR SELECT
TO authenticated
USING (true);

-- Admins and operators can modify leituras_diarias
CREATE POLICY "Admins and operators can insert leituras_diarias"
ON public.leituras_diarias
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operador'));

CREATE POLICY "Admins and operators can update leituras_diarias"
ON public.leituras_diarias
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'operador'));

CREATE POLICY "Admins can delete leituras_diarias"
ON public.leituras_diarias
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies for marcas_inversores - all authenticated users can read
CREATE POLICY "Authenticated users can view marcas_inversores"
ON public.marcas_inversores
FOR SELECT
TO authenticated
USING (true);

-- Only admins can modify marcas_inversores
CREATE POLICY "Admins can insert marcas_inversores"
ON public.marcas_inversores
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update marcas_inversores"
ON public.marcas_inversores
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete marcas_inversores"
ON public.marcas_inversores
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));