-- Create RLS policies for developer access to view all data

-- Developers can view all profiles
CREATE POLICY "Developers can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'developer'));

-- Developers can view all jobs
CREATE POLICY "Developers can view all jobs"
ON public.jobs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'developer'));

-- Developers can view all applications
CREATE POLICY "Developers can view all applications"
ON public.applications
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'developer'));

-- Developers can view all subscriptions
CREATE POLICY "Developers can view all subscriptions"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'developer'));

-- Developers can view all subscription usage
CREATE POLICY "Developers can view all subscription usage"
ON public.subscription_usage
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'developer'));

-- Developers can view all user roles
CREATE POLICY "Developers can view all user roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'developer'));

-- Developers can view all interviews
CREATE POLICY "Developers can view all interviews"
ON public.interviews
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'developer'));

-- Developers can view all documents
CREATE POLICY "Developers can view all documents"
ON public.documents
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'developer'));

-- Developers can view all document requests
CREATE POLICY "Developers can view all document requests"
ON public.document_requests
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'developer'));

-- Developers can view all voice credits
CREATE POLICY "Developers can view all voice credits"
ON public.voice_credits
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'developer'));