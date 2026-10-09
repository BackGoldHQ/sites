/* eslint-disable */
// The seven built-in content types, so their fields are typed without running the CLI.
// A generated file's own members override these. Do not edit by hand: regenerate with
// UPDATE_BUILTIN_TYPES=1 pnpm --filter @backgold/content test
export interface BackgoldFields {
  post: {};
  podcast: {};
  video: {};
  plank: {
    section: string; // Section
  };
  team_member: {
    role_title: string; // Role
    group: 'Leadership' | 'Staff'; // Group
    department: string | null; // Department
    link: string | null; // Link
    seat: { kind: 'entry'; label: string; slug: string } | { kind: string; label: string; url?: string } | null; // Seat
  };
  open_role: {
    department: string | null; // Department
    link: string | null; // Link
  };
  newsletter: {
    issue: string | null; // Issue
  };
}

declare module '@backgold/content' {
  interface BackgoldTypeMap extends BackgoldFields {}
}
