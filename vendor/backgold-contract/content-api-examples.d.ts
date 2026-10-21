import { Areas, AreasResponse, AuthorResponse, AuthorsResponse, CourseResponse, CoursesResponse, EntriesResponse, EntryResponse, EventResponse, EventsResponse, EventsLiveResponse, LessonResponse, LessonProgressResponse, MenuResponse, PageResponse, PagesResponse, RedirectsResponse, SectionsResponse, ShiftsResponse, ShiftsLiveResponse, SiteResponse, SitemapResponse, TermsResponse, TypesResponse, VisitorResponse, VisitorExchangeResponse } from './content-api.js';
import './constants-3dFHOvY5.js';

/**
 * One example of every headless Content API response, in the contract's own
 * shape: each is typed against its response type in content-api.ts, so tsc
 * fails when a field is added to or removed from the contract without the
 * example.
 *
 * Read by the api's OpenAPI document (each response's `example`, through
 * CONTENT_API_EXAMPLES), the frontend Developer page's sample (`pageExample`)
 * and the @backgold/content client's tests. Type imports only, so the file
 * loads on its own.
 */

/**
 * A page's areas: a dated countdown banner in Top banner (its `until` set; an
 * item whose `until` has passed is never sent), nothing in Sidebar, a sign-up
 * above the footer, framed by its reusable section. Every area of the site is
 * present by key.
 */
declare const areasExample: Areas;
declare const legalExample: {
    readonly disclaimer: "Paid for by Pine Valley for Liberty. Not authorized by any candidate or candidate’s committee.";
    readonly required: true;
};
declare const siteExample: SiteResponse;
declare const menuExample: MenuResponse;
declare const pagesExample: PagesResponse;
declare const pageExample: PageResponse;
declare const sectionsExample: SectionsResponse;
declare const typesExample: TypesResponse;
declare const entriesExample: EntriesResponse;
declare const entryExample: EntryResponse;
declare const areasResponseExample: AreasResponse;
declare const termsExample: TermsResponse;
declare const authorsExample: AuthorsResponse;
declare const authorExample: AuthorResponse;
declare const redirectsExample: RedirectsResponse;
declare const sitemapExample: SitemapResponse;
declare const eventsExample: EventsResponse;
declare const eventExample: EventResponse;
declare const eventsLiveExample: EventsLiveResponse;
/** Two open public shifts: one of the town hall's with room, one standalone that is full. */
declare const shiftsExample: ShiftsResponse;
declare const shiftsLiveExample: ShiftsLiveResponse;
declare const coursesExample: CoursesResponse;
declare const courseExample: CourseResponse;
declare const lessonExample: LessonResponse;
declare const lessonProgressExample: LessonProgressResponse;
declare const visitorExample: VisitorResponse;
declare const visitorExchangeExample: VisitorExchangeResponse;
/** Each response's example, by its OpenAPI schema name (the api's openapi-content.test.ts holds each against its schema). */
declare const CONTENT_API_EXAMPLES: Record<string, unknown>;

export { CONTENT_API_EXAMPLES, areasExample, areasResponseExample, authorExample, authorsExample, courseExample, coursesExample, entriesExample, entryExample, eventExample, eventsExample, eventsLiveExample, legalExample, lessonExample, lessonProgressExample, menuExample, pageExample, pagesExample, redirectsExample, sectionsExample, shiftsExample, shiftsLiveExample, siteExample, sitemapExample, termsExample, typesExample, visitorExample, visitorExchangeExample };
