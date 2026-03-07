/**
 * 检测用户配置是否存在
 */
// supabase/functions/check-data/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    if (req.method !== "GET") {
        return new Response(
            JSON.stringify({ error: "Method not allowed" }),
            { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "Missing authorization header" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: {
                headers: { Authorization: authHeader },
            },
        });

        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: "Invalid JWT", exists: false, status: "error" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const url = new URL(req.url);
        const userId = url.searchParams.get("userId");

        if (!userId) {
            return new Response(
                JSON.stringify({ error: "Missing 'userId' parameter" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (user.id !== userId) {
            return new Response(
                JSON.stringify({ error: "Unauthorized: User ID mismatch" }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        const { data, error } = await supabaseAdmin
            .from("user_configs")
            .select("data")
            .eq("user_id", userId)
            .single();

        if (error && error.code === "PGRST116") {
            return new Response(
                JSON.stringify({
                    exists: false,
                    status: "not_found",
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (error) {
            throw error;
        }

        const jsonData = data?.data;

        const hasValidData =
            jsonData !== null &&
            typeof jsonData === "object" &&
            Object.keys(jsonData).length > 0;

        if (hasValidData) {
            return new Response(
                JSON.stringify({
                    exists: true,
                    status: "found",
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        } else {
            return new Response(
                JSON.stringify({
                    exists: false,
                    status: "empty",
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

    } catch (err) {
        console.error("Error:", err);
        return new Response(
            JSON.stringify({ error: err.message, exists: false, status: "error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});