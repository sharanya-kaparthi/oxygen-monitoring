CREATE POLICY "Public delete access"
ON public.alerts
FOR DELETE
TO public
USING (true);