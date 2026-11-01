// The Content API contract names the kit and its templates use, bundled from
// the vendored contract (@backgold/contract, private to the workspace) into
// dist/contract/content-api.js by `pnpm build`, so the published kit carries
// them. The kit imports them as `#contract/content-api`; a template as
// `@backgold/template-kit/contract/content-api`.
export { VISITOR_PROGRESS_PATH, VISITOR_SIGN_IN_PATH } from '@backgold/contract/content-api'
export type {
  Areas,
  ContentAccessLevel,
  CourseDetail,
  CourseLesson,
  CourseProgress,
  CourseSummary,
  EntryLock,
  LessonResponse,
  Visitor,
} from '@backgold/contract/content-api'
