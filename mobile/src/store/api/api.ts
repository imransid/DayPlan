import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { DateTime } from "luxon";
import { config } from "../../config";
import { utcTaskDayStartIso } from "../../utils/utcTaskDay";

/** Narrow state for headers only — avoids importing `store.ts` (circular: store → api → store). */
type StateForAuthHeader = { auth: { accessToken: string | null } };
import type {
  User,
  Task,
  DiscordConnection,
  ChannelFormat,
  ReminderSchedule,
  MySharedChannels,
  SharedChannelSummary,
} from "../../types";

const baseQuery = fetchBaseQuery({
  baseUrl: config.apiUrl,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as StateForAuthHeader).auth.accessToken;
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return headers;
  },
});

const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const result = await baseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    api.dispatch({ type: "auth/logout" });
  }
  return result;
};

export interface RolloverResponse {
  copied: number;
  skipped: number;
  tasks: Task[];
}

export interface TestPublishResponse {
  posted: number;
  failed: number;
  results: Array<{
    channelName: string;
    status: "success" | "failed";
    error?: string;
  }>;
}

export const api = createApi({
  baseQuery: baseQueryWithAuth,
  // Background-first defaults: keep cached data around so screens render
  // instantly, and silently re-sync when the app returns to the foreground.
  // (refetchOnFocus is driven by AppState — see store/rtkAppStateFocus.ts —
  // since React Native has no browser focus/online events.)
  refetchOnFocus: true,
  refetchOnReconnect: true,
  keepUnusedDataFor: 300,
  tagTypes: [
    "Tasks",
    "User",
    "DiscordConnections",
    "DiscordChannels",
    "SharedChannels",
  ],
  endpoints: (builder) => ({
    // ─── Auth ────────────────────────────────────────────
    signUp: builder.mutation<
      { accessToken: string; user: User },
      { email: string; password: string; name?: string; timezone?: string }
    >({
      query: (body) => ({ url: "/auth/signup", method: "POST", body }),
    }),
    signIn: builder.mutation<
      { accessToken: string; user: User },
      { email: string; password: string }
    >({
      query: (body) => ({ url: "/auth/signin", method: "POST", body }),
    }),

    // ─── User ────────────────────────────────────────────
    getMe: builder.query<
      User & { reminderSchedule: ReminderSchedule | null },
      void
    >({
      query: () => "/users/me",
      providesTags: ["User"],
    }),
    updateProfile: builder.mutation<User, Partial<User>>({
      query: (body) => ({ url: "/users/me", method: "PATCH", body }),
      async onQueryStarted(body, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("getMe", undefined, (draft) => {
            Object.assign(draft, body);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["User"],
    }),
    updateSchedule: builder.mutation<
      ReminderSchedule,
      Partial<ReminderSchedule>
    >({
      query: (body) => ({ url: "/users/me/schedule", method: "PATCH", body }),
      async onQueryStarted(body, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("getMe", undefined, (draft) => {
            if (draft.reminderSchedule) {
              Object.assign(draft.reminderSchedule, body);
            }
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["User"],
    }),

    // ─── Tasks ───────────────────────────────────────────
    getTasks: builder.query<Task[], string | void>({
      query: (date) => ({ url: "/tasks", params: date ? { date } : undefined }),
      providesTags: ["Tasks"],
    }),
    getTaskHistory: builder.query<
      Record<string, Task[]>,
      { from: string; to: string }
    >({
      query: (params) => ({ url: "/tasks/history", params }),
    }),
    createTask: builder.mutation<Task, { title: string; date?: string }>({
      query: (body) => ({ url: "/tasks", method: "POST", body }),
      // Optimistic: the row appears the instant the sheet closes; the server
      // response swaps the placeholder for the real row. No invalidation, so
      // there's no blocking refetch.
      async onQueryStarted(body, { dispatch, queryFulfilled }) {
        const date = body.date ?? utcTaskDayStartIso();
        const tempId = `temp-${Date.now()}`;
        const patch = dispatch(
          api.util.updateQueryData("getTasks", date, (draft) => {
            draft.push({
              id: tempId,
              title: body.title,
              date,
              doneAt: null,
              position: draft.length,
            });
          }),
        );
        try {
          const { data } = await queryFulfilled;
          dispatch(
            api.util.updateQueryData("getTasks", date, (draft) => {
              const i = draft.findIndex((t) => t.id === tempId);
              if (i >= 0) draft[i] = data;
            }),
          );
        } catch {
          patch.undo();
        }
      },
    }),
    /**
     * Idempotent: copies yesterday's incomplete tasks into today. The mobile
     * app calls this whenever the local calendar day rolls over (cold start
     * after midnight, or app coming back to foreground past midnight).
     */
    rolloverTasks: builder.mutation<RolloverResponse, void>({
      query: () => ({ url: "/tasks/rollover", method: "POST" }),
      invalidatesTags: ["Tasks"],
    }),
    toggleTask: builder.mutation<Task, string>({
      query: (id) => ({ url: `/tasks/${id}/toggle`, method: "PATCH" }),
      // optimistic update — UI flips instantly
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const today = utcTaskDayStartIso();
        const patch = dispatch(
          api.util.updateQueryData("getTasks", today, (draft) => {
            const t = draft.find((task) => task.id === id);
            if (t)
              t.doneAt = t.doneAt
                ? null
                : DateTime.utc().toISO({ suppressMilliseconds: true })!;
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),
    updateTask: builder.mutation<
      Task,
      { id: string; title?: string; position?: number }
    >({
      query: ({ id, ...body }) => ({
        url: `/tasks/${id}`,
        method: "PATCH",
        body,
      }),
      async onQueryStarted({ id, title, position }, { dispatch, queryFulfilled }) {
        const date = utcTaskDayStartIso();
        const patch = dispatch(
          api.util.updateQueryData("getTasks", date, (draft) => {
            const t = draft.find((task) => task.id === id);
            if (!t) return;
            if (title !== undefined) t.title = title;
            if (position !== undefined) {
              draft.splice(draft.indexOf(t), 1);
              draft.splice(position, 0, t);
            }
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),
    deleteTask: builder.mutation<void, string>({
      query: (id) => ({ url: `/tasks/${id}`, method: "DELETE" }),
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const date = utcTaskDayStartIso();
        const patch = dispatch(
          api.util.updateQueryData("getTasks", date, (draft) => {
            const i = draft.findIndex((t) => t.id === id);
            if (i >= 0) draft.splice(i, 1);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
    }),

    // ─── Discord ─────────────────────────────────────────
    getDiscordAuthUrl: builder.query<{ url: string }, void>({
      query: () => "/discord/auth-url",
    }),
    getConnections: builder.query<DiscordConnection[], void>({
      query: () => "/discord/connections",
      providesTags: ["DiscordConnections"],
    }),
    listAvailableChannels: builder.query<
      Array<{ id: string; name: string; parentId: string | null }>,
      string
    >({
      query: (guildId) => ({ url: "/discord/channels", params: { guildId } }),
      providesTags: ["DiscordChannels"],
    }),
    saveChannels: builder.mutation<
      { ok: true },
      {
        guildId: string;
        channels: Array<{
          channelId: string;
          channelName: string;
          enabled?: boolean;
          format?: ChannelFormat;
          postGoals?: boolean;
          postUpdates?: boolean;
        }>;
      }
    >({
      query: (body) => ({ url: "/discord/channels", method: "POST", body }),
      // Optimistic: channel switches flip instantly; the wipe-and-replace POST
      // reconciles in the background. Invalidation stays as a safety re-sync.
      async onQueryStarted(body, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("getConnections", undefined, (draft) => {
            const conn = draft.find((c) => c.guildId === body.guildId);
            if (!conn) return;
            body.channels.forEach((u) => {
              const ch = conn.channels.find((c) => c.channelId === u.channelId);
              if (ch) Object.assign(ch, u);
            });
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["DiscordConnections"],
    }),
    /**
     * Manual "publish now" — useful for verifying Discord delivery from the
     * Settings screen without waiting for the scheduler to fire.
     */
    testPublish: builder.mutation<
      TestPublishResponse,
      { kind: "goal" | "work_update" }
    >({
      query: (body) => ({
        url: "/discord/test-publish",
        method: "POST",
        body,
      }),
    }),

    // ─── Team / shared channels ──────────────────────────
    getSharedChannels: builder.query<MySharedChannels, void>({
      query: () => "/discord/shared-channels",
      providesTags: ["SharedChannels"],
    }),
    createSharedChannel: builder.mutation<
      SharedChannelSummary,
      { guildId: string; channelId: string }
    >({
      query: (body) => ({
        url: "/discord/shared-channels",
        method: "POST",
        body,
      }),
      invalidatesTags: ["SharedChannels"],
    }),
    updateSharedChannel: builder.mutation<
      SharedChannelSummary,
      { id: string; enabled?: boolean; postGoals?: boolean; postUpdates?: boolean }
    >({
      query: ({ id, ...body }) => ({
        url: `/discord/shared-channels/${id}`,
        method: "PATCH",
        body,
      }),
      async onQueryStarted({ id, ...changes }, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("getSharedChannels", undefined, (draft) => {
            const owned = draft.owned.find((s) => s.id === id);
            if (owned) Object.assign(owned, changes);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["SharedChannels"],
    }),
    rotateSharedChannelCode: builder.mutation<
      { id: string; joinCode: string },
      string
    >({
      query: (id) => ({
        url: `/discord/shared-channels/${id}/rotate-code`,
        method: "POST",
      }),
      invalidatesTags: ["SharedChannels"],
    }),
    joinSharedChannel: builder.mutation<
      { sharedChannelId: string; channelName: string },
      { joinCode: string }
    >({
      query: (body) => ({
        url: "/discord/shared-channels/join",
        method: "POST",
        body,
      }),
      // Append on SUCCESS (server generates the id) so the joined list shows it
      // immediately, before the invalidation refetch reconciles.
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            api.util.updateQueryData("getSharedChannels", undefined, (draft) => {
              if (!draft.joined.some((s) => s.id === data.sharedChannelId)) {
                draft.joined.push({
                  id: data.sharedChannelId,
                  channelName: data.channelName,
                  enabled: true,
                });
              }
            }),
          );
        } catch {
          // The screen surfaces the error to the user.
        }
      },
      invalidatesTags: ["SharedChannels"],
    }),
    leaveSharedChannel: builder.mutation<{ ok: true }, string>({
      query: (id) => ({
        url: `/discord/shared-channels/${id}/leave`,
        method: "DELETE",
      }),
      // Optimistic: the joined card vanishes the moment you tap Leave.
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData("getSharedChannels", undefined, (draft) => {
            const i = draft.joined.findIndex((s) => s.id === id);
            if (i >= 0) draft.joined.splice(i, 1);
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["SharedChannels"],
    }),
  }),
});

export const {
  useSignUpMutation,
  useSignInMutation,
  useGetMeQuery,
  useUpdateProfileMutation,
  useUpdateScheduleMutation,
  useGetTasksQuery,
  useGetTaskHistoryQuery,
  useCreateTaskMutation,
  useRolloverTasksMutation,
  useToggleTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useLazyGetDiscordAuthUrlQuery,
  useGetConnectionsQuery,
  useListAvailableChannelsQuery,
  useSaveChannelsMutation,
  useTestPublishMutation,
  useGetSharedChannelsQuery,
  useCreateSharedChannelMutation,
  useUpdateSharedChannelMutation,
  useRotateSharedChannelCodeMutation,
  useJoinSharedChannelMutation,
  useLeaveSharedChannelMutation,
} = api;
