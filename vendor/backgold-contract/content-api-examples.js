// src/content-api-examples.ts
var areasExample = {
  top_banner: [
    {
      key: "levy-vote-countdown",
      label: "Levy vote countdown",
      from: null,
      until: "2026-11-04T05:59:00.000Z",
      sections: [
        {
          id: "TakeoverBanner-1",
          type: "TakeoverBanner",
          band: "plain",
          bleed: "full",
          variant: null,
          copy: { headline: "Vote no on the levy Nov 3", pitch: "Polls open at 7. Find yours in a minute." },
          media: {},
          links: [],
          options: {}
        }
      ]
    }
  ],
  sidebar: [],
  above_footer: [
    {
      key: "join-the-newsletter",
      label: "Join the newsletter",
      from: "2026-10-20T05:00:00.000Z",
      until: null,
      sections: [
        {
          id: "SignupCapture-1",
          type: "SignupCapture",
          band: "panel",
          bleed: "full",
          variant: null,
          copy: {
            kicker: "The weekly letter",
            heading: "Get the weekly update",
            lede: "What happened this week, what is next, and where to show up."
          },
          media: {},
          links: [],
          options: {},
          embed: {
            iframe: "https://api.backgold.com/embed/signup/section/3f9c2e7a1b5d4c8e9a0f6b2d7e1c4a85/SignupCapture-1",
            script: "https://secure.backgold.com/embed.js"
          }
        }
      ]
    }
  ]
};
var legalExample = {
  disclaimer: "Paid for by Pine Valley for Liberty. Not authorized by any candidate or candidate\u2019s committee.",
  required: true
};
var siteExample = {
  site: {
    id: "cd_8f2a",
    name: "Pine Valley for Liberty",
    domain: "pinevalleyliberty.org",
    mode: "headless",
    favicon_url: "https://api.backgold.com/api/media-files/med_logo",
    pack: "liberty-blue",
    style: '{"width":"full"}',
    theme: {
      id: "thm_3c9e",
      name: "Pine Valley Navy",
      heading_transform: "uppercase",
      heading_weight: 700,
      radius_px: 4,
      light: {
        colors: { primary: "#1b3a5c", secondary: "#0f2238", accent: "#c8102e", bg: null, backdrop: null },
        tokens: {
          bg: "#EEF1F6",
          surface: "#FFFFFF",
          surface_2: "#F4F7FB",
          ink: "#111827",
          muted: "#55607A",
          faint: "#929CB2",
          line: "#E4E8F0",
          line_strong: "#D2D8E6",
          accent_1: "#1b3a5c",
          accent_2: "#17314e",
          accent_text: "#c8102e",
          accent_ink: "#ffffff",
          accent_soft: "#1b3a5c1f",
          accent_line: "#1b3a5c55",
          hero_1: "#0f2238",
          hero_2: "#0a1624",
          map_open: "#D9DFEA",
          map_open_h: "#C5CEDE",
          map_stroke: "#FFFFFF"
        }
      },
      dark: {
        colors: { primary: "#6d9ccc", secondary: "#0f2238", accent: "#c8102e", bg: "#16181d", backdrop: "#101216" },
        tokens: {
          bg: "#101216",
          surface: "#16181d",
          surface_2: "#1d1f24",
          ink: "#FFFFFF",
          muted: "#9d9ea0",
          faint: "#7f8083",
          line: "#2d2f34",
          line_strong: "#68696c",
          accent_1: "#6d9ccc",
          accent_2: "#8ab0d6",
          accent_text: "#d9586d",
          accent_ink: "#0e0e0f",
          accent_soft: "#6d9ccc26",
          accent_line: "#6d9ccc55",
          hero_1: "#0f2238",
          hero_2: "#0a1624",
          map_open: "#323438",
          map_open_h: "#45464a",
          map_stroke: "#16181d"
        }
      },
      fonts: {
        heading: {
          family: "Roboto Slab",
          stack: `"Roboto Slab",Georgia,'Times New Roman',Times,serif`,
          source: "fontsource",
          files: [
            { weight: 400, url: "https://api.backgold.com/lp-runtime/5d1c0a7e9b3f42c6a8e17d90b2f4c3a65e8d1b7f0a2c9e4d6b3f8a1c7e5d2b90.woff2" },
            { weight: 700, url: "https://api.backgold.com/lp-runtime/a4e2f8c1d7b3096e5f2a8c4d1b7e3f90c6a2d8e4f1b7c3a9e5d2f8b4c1a7e3d6.woff2" }
          ]
        },
        body: {
          family: "Inter",
          stack: '"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
          source: "builtin",
          files: [
            { weight: 400, url: "https://api.backgold.com/lp-runtime/8909904ab6c872eb994093482a88a28eca2cd95912d7b6fecd72103b0dc07edc.woff2" },
            { weight: 500, url: "https://api.backgold.com/lp-runtime/f3779f1efccc4bdcdf9c0a02ab95bf6bd092ed09c48c08cedc725889edd1d19f.woff2" },
            { weight: 600, url: "https://api.backgold.com/lp-runtime/f9a06e79cd3a2a20951c0f0e28f66dd0e6d3fda73911d640a2125c8fcb78f21a.woff2" },
            { weight: 700, url: "https://api.backgold.com/lp-runtime/6f56409fd3d64bb85f7d070bce20749db2d66b6d63cec586cc22d1c761be2491.woff2" },
            { weight: 800, url: "https://api.backgold.com/lp-runtime/a7d0a50f15d389cad679238466bdb5fc9787aa0715719064ce25abaff042820d.woff2" }
          ]
        }
      },
      css_url: "https://api.backgold.com/api/content/v1/site/theme.css"
    },
    brand: { logo_url: "https://api.backgold.com/api/media-files/med_logo", primary_color: "#1b3a5c", secondary_color: "#f4efe6", accent_color: "#c8102e", palette_id: null },
    social: [{ platform: "facebook", url: "https://facebook.com/pinevalleyliberty" }],
    seo: { title: "Pine Valley for Liberty", description: "Lower taxes, open books, school choice." },
    chrome: {
      header: { layout: "bar" },
      footer: {
        layout: "columns",
        blurb: "A party for people who would rather be left alone.",
        address: "PO Box 112\nPine Valley, CA 91962",
        phone: "(619) 555-0142",
        legal_links: [{ label: "Privacy policy", url: "https://pinevalleyliberty.org/privacy" }],
        copyright: null,
        closing: null
      }
    }
  },
  areas: [
    { key: "top_banner", name: "Top banner" },
    { key: "sidebar", name: "Sidebar" },
    { key: "above_footer", name: "Above the footer" }
  ],
  legal: legalExample,
  version: 184,
  org_name: "Pine Valley for Liberty"
};
var menuExample = {
  menu: { key: "primary" },
  items: [
    { id: "nav_1", label: "Issues", kind: "page", target: { kind: "page", page_id: "lp_issues", slug: "issues" }, url: "/issues", external: false, header_button: false, shows_on: { rule: "only_pages", pages: [{ id: "lp_issues", url: "/issues" }] }, children: [] },
    {
      id: "nav_2",
      label: "Get involved",
      kind: "group",
      target: { kind: "group" },
      url: null,
      external: false,
      header_button: false,
      shows_on: { rule: "every_page" },
      children: [
        { id: "nav_3", label: "Volunteer", kind: "section", target: { kind: "section", page_id: "lp_home", slug: "home", anchor: "volunteer" }, url: "/#volunteer", external: false, header_button: false, shows_on: { rule: "except_pages", pages: [{ id: "lp_home", url: "/" }] }, children: [] },
        { id: "nav_4", label: "Our chapter", kind: "external", target: { kind: "external", url: "https://chapter.example.org" }, url: "https://chapter.example.org", external: true, header_button: false, shows_on: { rule: "every_page" }, children: [] }
      ]
    },
    { id: "nav_donate", label: "Donate", kind: "donate", target: { kind: "donate" }, url: "https://pine-valley.backgold.com/donate", external: false, header_button: true, shows_on: { rule: "donation_pages" }, children: [] }
  ]
};
var pagesExample = {
  pages: [
    { id: "lp_home", slug: "home", title: "Home", url: "/", is_home: true, published_at: "2026-09-30T14:00:00.000Z", updated_at: "2026-10-01T09:12:00.000Z", takes_donations: true }
  ]
};
var pageExample = {
  page: {
    id: "lp_home",
    slug: "home",
    title: "Home",
    url: "/",
    is_home: true,
    published_at: "2026-09-30T14:00:00.000Z",
    takes_donations: true,
    meta: { title: "Pine Valley for Liberty", description: "Freeze the levy.", image_url: null }
  },
  sections: [
    {
      id: "Hero-1",
      type: "Hero",
      band: "contrast",
      bleed: "full",
      variant: "split",
      copy: {
        headline: "Keep more of what you earn.",
        subheadline: "Freeze the levy and post every check online.",
        ctaText: "Get involved"
      },
      media: { imageUrl: { url: "https://api.backgold.com/api/lp-assets/a1/hero.webp" } },
      links: [{ label: "Get involved", target: { kind: "page", slug: "get-involved" }, url: "/get-involved" }],
      options: { photoTint: "brand" }
    },
    {
      id: "Donate-1",
      type: "Donate",
      band: "panel",
      bleed: "full",
      variant: null,
      copy: { heading: "Fund the fight for lower taxes" },
      media: {},
      links: [],
      options: {},
      embed: { iframe: "https://secure.backgold.com/embed/d/df_general", script: "https://secure.backgold.com/embed.js" }
    },
    {
      id: "Map-1",
      type: "Map",
      band: "plain",
      bleed: "full",
      variant: null,
      copy: { heading: "Where we are organized", litLabel: "Chartered", darkLabel: "Not yet" },
      media: { geoUrl: { url: "https://api.backgold.com/lp-runtime/3f9a1c.json" } },
      links: [],
      options: { geoId: "tx-counties", regionTotal: 254, regionNoun: "county" },
      data: {
        source: "regions",
        items: [
          { region: "Travis", status: "lit", url: "https://travis.example.org", is_new: true },
          { region: "Hays", status: "dark", url: null, is_new: false }
        ]
      }
    },
    {
      id: "CandidateRoster-1",
      type: "CandidateRoster",
      band: "plain",
      bleed: "full",
      variant: null,
      copy: { heading: "Our candidates" },
      media: {},
      links: [],
      options: { showFilters: true },
      data: {
        source: "candidates",
        items: [
          {
            name: "Pat Lee",
            office: "State House",
            level: "State",
            region: "District 31, TX",
            issues: ["Property taxes", "School choice"],
            status: "On the ballot",
            donate_url: "https://patlee.example.org/donate",
            web_url: "https://patlee.example.org",
            image_url: "https://api.backgold.com/api/media-files/med_pat"
          }
        ]
      }
    },
    {
      id: "TeamGrid-1",
      type: "TeamGrid",
      band: "plain",
      bleed: "full",
      variant: null,
      copy: { heading: "Leadership", interestButtonText: "Ask about running" },
      media: {},
      links: [{ label: "Ask about running", target: { kind: "page", slug: "run" }, url: "/run" }],
      options: { showOpenRoles: true },
      data: {
        source: "team",
        items: [
          {
            group: "roster",
            body: "Pine Valley Liberty Party",
            body_key: "pb_9f2",
            seat: "Chair",
            name: "Rowan Achterberg",
            since: "2023-04-15",
            term_ends: "2027-04-10",
            is_officer: true,
            photo_url: "https://api.backgold.com/api/media-files/med_rowan",
            bio: "Runs a hardware store in Osgood and has chaired the party since the 2023 convention.",
            link: "https://rowan.example.org",
            url: "https://pinevalleyliberty.org"
          },
          {
            group: "roster",
            body: "Pine Valley Liberty Party",
            body_key: "pb_9f2",
            seat: "At-large",
            name: null,
            since: null,
            term_ends: null,
            is_officer: false,
            photo_url: null,
            bio: null,
            link: null,
            url: "https://pinevalleyliberty.org"
          },
          {
            group: "roster",
            body: "Staff",
            body_key: "staff",
            seat: "Field director",
            name: "Sam Ortiz",
            since: null,
            term_ends: null,
            is_officer: false,
            photo_url: null,
            bio: null,
            link: null,
            url: null
          }
        ]
      }
    }
  ],
  areas: areasExample,
  legal: legalExample
};
var sectionsExample = {
  section: { key: "town-halls", label: "Town halls", kind: "custom", role: null },
  sections: [
    {
      id: "Hero-1",
      type: "Hero",
      band: "contrast",
      bleed: "full",
      variant: "centered",
      copy: { kicker: "Town halls", headline: "Ask us anything.", ctaText: "", secondaryText: "Send a question" },
      media: {},
      links: [{ label: "Send a question", target: { kind: "page", slug: "contact" }, url: "/contact" }],
      options: {},
      section_ref: { key: "town-halls", label: "Town halls" }
    },
    {
      id: "EventsList-1",
      type: "EventsList",
      band: "plain",
      bleed: "full",
      variant: "agenda",
      copy: { kicker: "In person", heading: "Come to a meeting", allLabel: "All events" },
      media: {},
      links: [
        {
          label: "All events",
          target: { kind: "surface", surface: "events", path: "/events" },
          url: "https://pine-valley.backgold.com/events"
        }
      ],
      options: { max: 3, actions: "buttons" },
      data: {
        source: "events",
        items: [
          {
            id: "evt_2k9",
            title: "Town hall",
            starts_at: "2026-10-09T00:00:00.000Z",
            ends_at: null,
            timezone: "America/Chicago",
            location: "Pine Valley Library",
            is_virtual: false,
            type: "blank",
            registration_closed: false,
            url: "https://pine-valley.backgold.com/events/town-hall",
            sells_tickets: false,
            tickets_url: null,
            lat: null,
            lng: null
          }
        ]
      },
      section_ref: { key: "town-halls", label: "Town halls" }
    },
    {
      id: "About-1",
      type: "About",
      band: "plain",
      bleed: "full",
      variant: "left",
      copy: {
        heading: "Your host",
        role: "Pat Lee, candidate for State House",
        signature: "Pat Lee",
        body: "Pat has lived in Pine Valley for twenty years."
      },
      media: { photoUrl: { url: "https://api.backgold.com/api/media-files/med_pat" } },
      links: [],
      options: { photoStyle: "photo" },
      section_ref: { key: "town-halls", label: "Town halls" }
    },
    {
      id: "Cta-1",
      type: "Cta",
      band: "contrast",
      bleed: "contained",
      variant: "banner",
      copy: { eyebrow: "Can\u2019t make it?", heading: "Send us your question", donateButtonText: "", volunteerButtonText: "Ask a question" },
      media: { photoUrl: { url: "https://api.backgold.com/api/lp-assets/a1/town-hall.webp" } },
      links: [{ label: "Ask a question", target: { kind: "page", slug: "contact" }, url: "/contact" }],
      options: {},
      section_ref: { key: "town-halls", label: "Town halls" }
    }
  ]
};
var typesExample = {
  types: [
    {
      key: "endorsement",
      singular_label: "Endorsement",
      plural_label: "Endorsements",
      routable: true,
      url_base: "endorsements",
      built_in: false,
      index: null,
      fields: [
        { key: "quote", label: "Quote", kind: "long_text", required: true },
        { key: "tier", label: "Tier", kind: "choice", required: false, choices: ["Gold", "Silver"] }
      ]
    }
  ]
};
var entry = {
  id: "ci_7d1",
  slug: "levy-explained",
  type: "post",
  title: "The levy, explained",
  summary: "Where the money goes.",
  url: "/blog/levy-explained",
  hero: { url: "https://api.backgold.com/api/content-pages/pine-valley/hero/ci_7d1?v=1" },
  media_url: null,
  publish_at: "2026-09-29T12:00:00.000Z",
  updated_at: "2026-09-29T12:05:00.000Z",
  terms: [{ taxonomy: "tag", slug: "taxes", label: "Taxes" }],
  authors: [{ slug: "dana-k", display_name: "Dana K.", avatar_url: null, link_url: null, role: "Written by" }],
  access: "public",
  locked: false,
  lock: null,
  duration_seconds: null,
  renditions: null,
  body: { markdown: "## Where it goes\n\nEvery dollar\u2026" },
  fields: { endorser: { kind: "entry", label: "Mayor Jones", slug: "mayor-jones" }, give_here: { kind: "form", label: "General fund", url: "https://pine-valley.backgold.com/donate/give" } }
};
var { body: _body, fields: _fields, ...entrySummary } = entry;
var entriesExample = {
  entries: [entrySummary],
  next_cursor: "MjAyNi0wOS0yOVQxMjowMDowMC4wMDBafGNpXzdkMQ",
  areas: areasExample
};
var entryExample = { entry, areas: areasExample };
var areasResponseExample = { areas: areasExample };
var termsExample = {
  taxonomy: { key: "tag", label: "Tags", hierarchical: false },
  terms: [{ id: "term_1", slug: "taxes", label: "Taxes", parent_id: null, position: 0 }]
};
var author = {
  slug: "dana-k",
  display_name: "Dana K.",
  bio: "Treasurer.",
  avatar_url: null,
  link_url: "https://example.org/dana"
};
var authorsExample = { authors: [author] };
var authorExample = { author };
var redirectsExample = {
  redirects: [
    { source: "/old-issues", destination: "/issues", status_code: 301 },
    { source: "/2022-slate", destination: null, status_code: 410 }
  ]
};
var sitemapExample = {
  urls: [
    { url: "https://pinevalleyliberty.org/", kind: "page", updated_at: "2026-10-01T09:12:00.000Z" },
    { url: "https://pinevalleyliberty.org/blog", kind: "type_index", updated_at: "2026-09-29T12:05:00.000Z" },
    { url: "https://pinevalleyliberty.org/blog/levy-explained", kind: "entry", updated_at: "2026-09-29T12:05:00.000Z" }
  ]
};
var eventsExample = {
  events: [
    {
      id: "evt_2k9",
      title: "Town hall",
      starts_at: "2026-10-09T00:00:00.000Z",
      ends_at: null,
      timezone: "America/Chicago",
      location: "Pine Valley Library",
      is_virtual: false,
      type: "blank",
      registration_closed: false,
      url: "https://pine-valley.backgold.com/events/town-hall",
      sells_tickets: false,
      tickets_url: null,
      lat: null,
      lng: null
    },
    {
      id: "evt_4m1",
      title: "Liberty dinner",
      starts_at: "2026-10-17T23:30:00.000Z",
      ends_at: "2026-10-18T02:00:00.000Z",
      timezone: "America/Chicago",
      location: "Pine Valley Grange",
      is_virtual: false,
      type: "fundraiser",
      registration_closed: false,
      url: "https://pine-valley.backgold.com/events/liberty-dinner",
      sells_tickets: true,
      tickets_url: "https://pine-valley.backgold.com/events/liberty-dinner",
      lat: 32.7767,
      lng: -96.797
    }
  ],
  types: [
    { key: "fundraiser", label: "Fundraiser", upcoming: 1 },
    { key: "blank", label: "Event", upcoming: 3 }
  ],
  next_cursor: "MjAyNi0xMC0xN1QyMzozMDowMC4wMDBafGV2dF80bTE"
};
var eventExample = {
  event: {
    ...eventsExample.events[1],
    slug: "liberty-dinner",
    description: "<p>Dinner with every candidate on the county ballot, and a few short speeches. <strong>Bring a neighbor.</strong></p>",
    venue: "Pine Valley Grange",
    address: "14 Rail Street, Pine Valley, TX 75001",
    image_url: "https://api.backgold.com/lp-assets/org_pv/dinner.jpg",
    directions_url: "https://www.google.com/maps/dir/?api=1&destination=32.7767%2C-96.797",
    embed: { iframe: "https://secure.backgold.com/embed/e/pine-valley/liberty-dinner", script: "https://secure.backgold.com/embed.js" }
  },
  areas: areasExample
};
var eventsLiveExample = {
  events: [
    { id: "evt_2k9", going: 41, seats_left: null },
    { id: "evt_4m1", going: 88, seats_left: 12 }
  ]
};
var course = {
  id: "ci_c01",
  slug: "foundations",
  title: "Foundational Leadership",
  summary: "Short lessons on leading a local chapter.",
  url: "/courses/foundations",
  hero: { url: "https://api.backgold.com/api/content-pages/pine-valley/hero/ci_c01?v=1" },
  publish_at: "2026-10-01T12:00:00.000Z",
  updated_at: "2026-10-02T09:00:00.000Z",
  access: "signed_in",
  locked: false,
  lock: null,
  lesson_count: 3,
  total_seconds: 1010,
  progress: { completed: 1, total: 3, openable: 2, seconds_left: 290, next_lesson_slug: "decide-what-you-want" },
  body: { markdown: "Three lessons, about seventeen minutes in all." },
  lessons: [
    {
      id: "ci_l01",
      slug: "start-here",
      title: "Start here",
      summary: null,
      url: "/courses/foundations/start-here",
      hero: null,
      duration_seconds: 240,
      position: 0,
      access: "signed_in",
      locked: false,
      lock: null,
      completed: true,
      completed_at: "2026-10-14T18:20:00.000Z",
      position_seconds: 240
    },
    {
      id: "ci_l02",
      slug: "decide-what-you-want",
      title: "Decide what you want",
      summary: "One thing you want to be true in a year.",
      url: "/courses/foundations/decide-what-you-want",
      hero: null,
      duration_seconds: 290,
      position: 1,
      access: "signed_in",
      locked: false,
      lock: null,
      completed: false,
      completed_at: null,
      position_seconds: 72
    },
    {
      id: "ci_l03",
      slug: "run-the-meeting",
      title: "Run the meeting",
      summary: null,
      url: "/courses/foundations/run-the-meeting",
      hero: null,
      duration_seconds: 480,
      position: 2,
      access: "members",
      locked: true,
      lock: { reason: "members", tag_label: null, org_name: "Pine Valley for Liberty" },
      completed: false,
      completed_at: null,
      position_seconds: null
    }
  ]
};
var { body: _courseBody, lessons: _courseLessons, ...courseSummary } = course;
var coursesExample = { courses: [courseSummary], next_cursor: null, areas: areasExample };
var courseExample = { course, areas: areasExample };
var lessonExample = {
  lesson: {
    id: "ci_l02",
    slug: "decide-what-you-want",
    type: "video",
    title: "Decide what you want",
    summary: "One thing you want to be true in a year.",
    url: "/videos/decide-what-you-want",
    hero: null,
    media_url: "https://api.backgold.com/api/media-files/med_9f2",
    publish_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
    terms: [],
    authors: [],
    access: "signed_in",
    locked: false,
    lock: null,
    duration_seconds: 290,
    renditions: { "720": "https://api.backgold.com/api/media-files/med_9f2?size=720", "1080": "https://api.backgold.com/api/media-files/med_9f2?size=1080" },
    body: { markdown: "Three questions before the next lesson." },
    fields: {}
  },
  course,
  previous: { slug: "start-here", title: "Start here", url: "/courses/foundations/start-here" },
  next: { slug: "run-the-meeting", title: "Run the meeting", url: "/courses/foundations/run-the-meeting" },
  areas: areasExample
};
var lessonProgressExample = {
  progress: { completed: true, completed_at: "2026-10-18T15:04:00.000Z", position_seconds: 290 },
  course: { completed: 2, total: 3, openable: 2, seconds_left: 0, next_lesson_slug: null }
};
var visitorExample = { visitor: { first_name: "Dana", email: "dana.m@example.com", member: false } };
var visitorExchangeExample = {
  token: "YWNjdF8xLnNlc3NfMS5zaXRlX3B2LjE3NjA4MDA0MDA.3f9a\u2026",
  expires_at: "2026-10-18T16:00:00.000Z",
  visitor: { first_name: "Dana", email: "dana.m@example.com", member: false }
};
var CONTENT_API_EXAMPLES = {
  SiteResponse: siteExample,
  MenuResponse: menuExample,
  PagesResponse: pagesExample,
  PageResponse: pageExample,
  SectionsResponse: sectionsExample,
  TypesResponse: typesExample,
  EntriesResponse: entriesExample,
  EntryResponse: entryExample,
  TermsResponse: termsExample,
  AuthorsResponse: authorsExample,
  AuthorResponse: authorExample,
  RedirectsResponse: redirectsExample,
  SitemapResponse: sitemapExample,
  AreasResponse: areasResponseExample,
  EventsResponse: eventsExample,
  EventResponse: eventExample,
  EventsLiveResponse: eventsLiveExample,
  CoursesResponse: coursesExample,
  CourseResponse: courseExample,
  LessonResponse: lessonExample,
  LessonProgressResponse: lessonProgressExample,
  VisitorResponse: visitorExample,
  VisitorExchangeResponse: visitorExchangeExample
};

export { CONTENT_API_EXAMPLES, areasExample, areasResponseExample, authorExample, authorsExample, courseExample, coursesExample, entriesExample, entryExample, eventExample, eventsExample, eventsLiveExample, legalExample, lessonExample, lessonProgressExample, menuExample, pageExample, pagesExample, redirectsExample, sectionsExample, siteExample, sitemapExample, termsExample, typesExample, visitorExample, visitorExchangeExample };
