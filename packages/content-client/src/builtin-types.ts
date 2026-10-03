/* eslint-disable */
// The six built-in content types, so their fields are typed without running the CLI.
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
  };
  open_role: {
    department: string | null; // Department
    link: string | null; // Link
  };
}

declare module '@backgold/content' {
  interface BackgoldTypeMap extends BackgoldFields {}
}
