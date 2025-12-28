-- Enable realtime for voice_credits table so subscription UI updates instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_credits;