import {
  createApi,
  fetchBaseQuery,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { config } from "../../config";

/** Narrow state for headers only — avoids importing `store.ts` (circular: store → api → store). */
type StateForAuthHeader = { auth: { accessToken: string | null } };
import type {
  User,
  Task,
  DiscordConnection,
  ChannelFormat,
  ReminderSchedule,
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

export const api = createApi({
  baseQuery: baseQueryWithAuth,
  tagTypes: ["Tasks", "User", "DiscordConnections", "DiscordChannels"],
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
    // Profile patch now accepts goalPostTime and workUpdateTime in addition to legacy fields.
    updateProfile: builder.mutation<User, Partial<User>>({
      query: (body) => ({ url: "/users/me", method: "PATCH", body }),
      invalidatesTags: ["User"],
    }),
    updateSchedule: builder.mutation<
      ReminderSchedule,
      Partial<ReminderSchedule>
    >({
      query: (body) => ({ url: "/users/me/schedule", method: "PATCH", body }),
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
      invalidatesTags: ["Tasks"],
    }),
    toggleTask: builder.mutation<Task, string>({
      query: (id) => ({ url: `/tasks/${id}/toggle`, method: "PATCH" }),
      // optimistic update — UI flips instantly
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const today = new Date().toISOString().split("T")[0];
        const patch = dispatch(
          api.util.updateQueryData("getTasks", today, (draft) => {
            const t = draft.find((task) => task.id === id);
            if (t) t.doneAt = t.doneAt ? null : new Date().toISOString();
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
      invalidatesTags: ["Tasks"],
    }),
    deleteTask: builder.mutation<void, string>({
      query: (id) => ({ url: `/tasks/${id}`, method: "DELETE" }),
      invalidatesTags: ["Tasks"],
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
          // New per-channel routing flags
          postGoals?: boolean;
          postUpdates?: boolean;
        }>;
      }
    >({
      query: (body) => ({ url: "/discord/channels", method: "POST", body }),
      invalidatesTags: ["DiscordConnections"],
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
  useToggleTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useLazyGetDiscordAuthUrlQuery,
  useGetConnectionsQuery,
  useListAvailableChannelsQuery,
  useSaveChannelsMutation,
} = api;
