import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { useEffect } from "react";

export type Message = Tables<"messages"> & {
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
};
export type MessageInsert = TablesInsert<"messages">;

export interface MessageWithProfile extends Message {
  sender_profile: Tables<"profiles"> | null;
  receiver_profile: Tables<"profiles"> | null;
}

export interface Conversation {
  contact_id: string;
  contact_profile: Tables<"profiles"> | null;
  last_message: Message | null;
  unread_count: number;
  job_title?: string;
  application_id?: string;
}

export interface MessageableEmployer {
  employer_id: string;
  employer_profile: Tables<"profiles"> | null;
  job_title: string;
  application_id: string;
}

export interface MessageableCandidate {
  candidate_id: string;
  candidate_profile: Tables<"profiles"> | null;
  job_title: string;
  application_id: string;
}

// Hook to get employers the candidate can message (from their applications)
export function useMessageableEmployers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["messageable-employers", user?.id],
    queryFn: async () => {
      // Get all applications for this candidate with job details
      const { data: applications, error } = await supabase
        .from("applications")
        .select("id, job_id, jobs(title, employer_id)")
        .eq("candidate_id", user!.id);

      if (error) throw error;

      // Get unique employer IDs
      const employerIds = [...new Set(
        applications
          .map((app: any) => app.jobs?.employer_id)
          .filter(Boolean)
      )];

      if (employerIds.length === 0) return [];

      // Fetch employer profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", employerIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

      // Create messageable employers list
      const employers: MessageableEmployer[] = applications
        .filter((app: any) => app.jobs?.employer_id)
        .map((app: any) => ({
          employer_id: app.jobs.employer_id,
          employer_profile: profileMap.get(app.jobs.employer_id) || null,
          job_title: app.jobs.title,
          application_id: app.id,
        }));

      // Dedupe by employer_id (keep first occurrence with job title)
      const seen = new Set<string>();
      return employers.filter((e) => {
        if (seen.has(e.employer_id)) return false;
        seen.add(e.employer_id);
        return true;
      });
    },
    enabled: !!user,
  });
}

// Hook to get candidates the employer can message (from applications to their jobs)
export function useMessageableCandidates() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["messageable-candidates", user?.id],
    queryFn: async () => {
      // Get all jobs for this employer
      const { data: jobs, error: jobsError } = await supabase
        .from("jobs")
        .select("id, title, employer_id")
        .eq("employer_id", user!.id);

      if (jobsError) throw jobsError;
      if (!jobs || jobs.length === 0) return [];

      const jobIds = jobs.map((j) => j.id);

      // Get all applications for these jobs
      const { data: applications, error } = await supabase
        .from("applications")
        .select("id, candidate_id, job_id")
        .in("job_id", jobIds);

      if (error) throw error;
      if (!applications || applications.length === 0) return [];

      // Get unique candidate IDs
      const candidateIds = [...new Set(applications.map((app) => app.candidate_id))];

      // Fetch candidate profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", candidateIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);
      const jobMap = new Map(jobs.map((j) => [j.id, j.title]));

      // Create messageable candidates list
      const candidates: MessageableCandidate[] = applications.map((app) => ({
        candidate_id: app.candidate_id,
        candidate_profile: profileMap.get(app.candidate_id) || null,
        job_title: jobMap.get(app.job_id) || "Unknown Job",
        application_id: app.id,
      }));

      return candidates;
    },
    enabled: !!user,
  });
}

export function useConversations() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["conversations", user?.id],
    queryFn: async () => {
      // Check if user is a team member
      const { data: teamMember } = await supabase
        .from("team_members")
        .select("employer_id, assigned_job_ids")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .maybeSingle();

      let messages: Message[] = [];

      if (teamMember) {
        // For team members: fetch messages related to their employer's applications
        // First get applications for assigned jobs
        const { data: applications, error: appError } = await supabase
          .from("applications")
          .select("id, candidate_id, jobs!inner(employer_id)")
          .eq("jobs.employer_id", teamMember.employer_id);

        if (appError) throw appError;

        // Filter by assigned jobs if applicable
        const filteredApps = teamMember.assigned_job_ids?.length 
          ? applications 
          : applications;

        const applicationIds = filteredApps?.map(a => a.id) || [];
        const candidateIds = [...new Set(filteredApps?.map(a => a.candidate_id) || [])];

        if (applicationIds.length > 0) {
          // Fetch messages for these applications OR between employer and candidates
          const { data: appMessages, error: msgError } = await supabase
            .from("messages")
            .select("*")
            .or(`sender_id.eq.${teamMember.employer_id},receiver_id.eq.${teamMember.employer_id}`)
            .order("created_at", { ascending: false });

          if (msgError) throw msgError;
          
          // Filter to only show messages with candidates from assigned jobs
          messages = (appMessages || []).filter(msg => 
            candidateIds.includes(msg.sender_id) || candidateIds.includes(msg.receiver_id)
          );
        }
      } else {
        // Regular user: fetch their own messages
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .or(`sender_id.eq.${user!.id},receiver_id.eq.${user!.id}`)
          .order("created_at", { ascending: false });

        if (error) throw error;
        messages = data || [];
      }

      // Group by conversation partner
      const conversationMap = new Map<string, { messages: Message[]; unread: number }>();
      const effectiveUserId = teamMember?.employer_id || user!.id;
      
      for (const msg of messages) {
        const contactId = msg.sender_id === effectiveUserId ? msg.receiver_id : msg.sender_id;
        
        if (!conversationMap.has(contactId)) {
          conversationMap.set(contactId, { messages: [], unread: 0 });
        }
        
        const conv = conversationMap.get(contactId)!;
        conv.messages.push(msg);
        
        // For team members, count unread based on employer's perspective
        if (!msg.is_read && msg.receiver_id === effectiveUserId) {
          conv.unread++;
        }
      }

      // Fetch profiles for contacts
      const contactIds = Array.from(conversationMap.keys());
      
      if (contactIds.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", contactIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles.map((p) => [p.user_id, p]));

      const conversations: Conversation[] = contactIds.map((contactId) => {
        const conv = conversationMap.get(contactId)!;
        return {
          contact_id: contactId,
          contact_profile: profileMap.get(contactId) || null,
          last_message: conv.messages[0],
          unread_count: conv.unread,
        };
      });

      return conversations;
    },
    enabled: !!user,
  });
}

export function useMessages(contactId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["messages", user?.id, contactId],
    queryFn: async () => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user!.id},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${user!.id})`
        )
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as Message[];
    },
    enabled: !!user && !!contactId,
  });

  // Real-time subscription
  useEffect(() => {
    if (!user || !contactId) return;

    const channel = supabase
      .channel(`messages-${user.id}-${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = payload.new as Message;
          if (
            (msg.sender_id === user.id && msg.receiver_id === contactId) ||
            (msg.sender_id === contactId && msg.receiver_id === user.id)
          ) {
            queryClient.invalidateQueries({ queryKey: ["messages", user.id, contactId] });
            queryClient.invalidateQueries({ queryKey: ["conversations", user.id] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, contactId, queryClient]);

  return query;
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ 
      receiver_id, 
      content, 
      application_id,
      file
    }: { 
      receiver_id: string; 
      content: string; 
      application_id?: string;
      file?: File;
    }) => {
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      let fileType: string | null = null;
      let fileSize: number | null = null;

      // Upload file if provided
      if (file) {
        const fileExt = file.name.split(".").pop();
        const filePath = `${user!.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("message-attachments")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("message-attachments")
          .getPublicUrl(filePath);

        fileUrl = publicUrl;
        fileName = file.name;
        fileType = file.type;
        fileSize = file.size;
      }

      const { data, error } = await supabase
        .from("messages")
        .insert({
          sender_id: user!.id,
          receiver_id,
          content: content || (file ? `Sent a file: ${file.name}` : ""),
          application_id,
          file_url: fileUrl,
          file_name: fileName,
          file_type: fileType,
          file_size: fileSize,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["messages", user?.id, variables.receiver_id] });
      queryClient.invalidateQueries({ queryKey: ["conversations", user?.id] });
    },
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (messageIds: string[]) => {
      const { error } = await supabase
        .from("messages")
        .update({ is_read: true })
        .in("id", messageIds)
        .eq("receiver_id", user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (contactId: string) => {
      // Delete all messages between user and contact
      const { error } = await supabase
        .from("messages")
        .delete()
        .or(
          `and(sender_id.eq.${user!.id},receiver_id.eq.${contactId}),and(sender_id.eq.${contactId},receiver_id.eq.${user!.id})`
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
