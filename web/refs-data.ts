// The sources behind each mode and idea: References lists them, the thread sheet quotes one.
// Quotes checked on 2026-10-18. `warn` marks a secondary source.
// `q` is the quote; the thread sheet reads it too.
export type Reference = { q?: string; says?: string; who: string; url: string; warn?: string };
export type Topic = { title: string; description: string; examples: string[]; items: Reference[] };
export const REFS: Record<string, Topic> = {
  clarify: {
    title: "Clarify",
    description: "Made a fuzzy problem clear.",
    examples: ["Proposals", "Decision docs", "Framing", "Scoping"],
    items: [
      {
        q: "The highest-leverage work I do is to provide technical clarity to the organization",
        who: "Sean Goedecke, Staff Engineer at GitHub",
        url: "https://www.seangoedecke.com/clarity/",
      },
      {
        q: "Illuminate and clarify",
        who: "Amazon, Principal Engineering Tenets",
        url: "https://www.amazon.jobs/content/en/teams/principal-engineering/tenets",
      },
      {
        q: "Where a Product Manager focuses on the 'What', the Tech Lead focuses on the 'How.'",
        who: "Pat Kua",
        url: "https://www.patkua.com/blog/the-definition-of-a-tech-lead/",
      },
    ],
  },
  prevent: {
    title: "Prevent the wrong build",
    description: "Stopped a bad outcome before it happened.",
    examples: ["A risk caught in review", "A guard", 'A "let\'s not build this"'],
    items: [
      {
        q: "Often the most impactful things I do is convince someone not to write a new thing.",
        who: "Silvia Botros, Senior Principal at Twilio",
        url: "https://staffeng.com/stories/silvia-botros/",
      },
      {
        q: "A surprising number of projects are one small change away from succeeding",
        who: "Will Larson, Work on what matters",
        url: "https://staffeng.com/guides/work-on-what-matters/",
      },
    ],
  },
  solve: {
    title: "Solve what has no owner",
    description: "Fixed a live problem.",
    examples: ["An incident", "A bug", "An unblock"],
    items: [
      {
        q: "The Solver digs deep into arbitrarily complex problems and finds an appropriate path forward.",
        who: "Will Larson, Staff archetypes",
        url: "https://staffeng.com/guides/staff-archetypes/",
      },
      {
        q: "at the senior levels, we are expected to identify problems that match business opportunities",
        who: "Camille Fournier",
        url: "https://www.elidedbranches.com/2023/07/the-next-larger-context.html",
      },
    ],
  },
  build: {
    title: "Build at company scope",
    description: "Shipped product or platform work.",
    examples: ["Features", "Platform", "Migrations"],
    items: [
      {
        q: "I own and deliver org/company-wide multi-year, multi-team goals",
        who: "Dropbox, IC6 Principal",
        url: "https://dropbox.github.io/dbx-career-framework/ic6_principal_software_engineer.html",
      },
      {
        q: "Principal Engineers are hands-on and lead by example.",
        who: "Amazon, Exemplary practitioner",
        warn: "Hacker News repost, not the official page",
        url: "https://news.ycombinator.com/item?id=26004088",
      },
      {
        q: "Solves technical problems of the highest scope, complexity, and ambiguity for their sub-department.",
        who: "GitLab, Principal Engineer",
        url: "https://handbook.gitlab.com/job-families/engineering/development/management/principal-engineer/",
      },
    ],
  },
  elevate: {
    title: "Elevate people",
    description: "Made other people better.",
    examples: ["Teaching reviews", "Mentoring", "Pairing", "Recognition"],
    items: [
      {
        q: "To sponsor someone is to feel on the hook to help get someone promoted.",
        who: "Lara Hogan",
        url: "https://larahogan.me/blog/what-sponsorship-looks-like/",
      },
      {
        q: "our job isn't to do the code, but to help others do it with growth and the long-term in mind.",
        who: "Silvia Botros",
        url: "https://staffeng.com/stories/silvia-botros/",
      },
      {
        q: "Who have you mentored and through what accomplishments?",
        who: "Will Larson, Promo packets",
        url: "https://lethain.com/promo-packets/",
      },
    ],
  },
  external: {
    title: "Industry presence",
    description: "Work outside the company.",
    examples: ["Open source upstream", "Talks", "Community"],
    items: [
      {
        q: "She is an approver for the OpenTelemetry Go SIG, wrote vendor exporters for Go and Python",
        who: "Liz Fong-Jones, OTel GC 2020 candidacy",
        url: "https://github.com/open-telemetry/community/blob/main/elections/2020/governance-committee-candidates.md",
      },
      {
        q: "As a GC member, I actively mediate community conflicts.",
        who: "Juraci Paixão Kröhling",
        url: "https://grafana.com/blog/2024/08/16/behind-the-scenes-of-the-opentelemetry-governance-committee/",
      },
      {
        q: "Interact with customers and other external stakeholders as a consultant and spokesperson",
        who: "GitLab, Principal Engineer",
        url: "https://handbook.gitlab.com/job-families/engineering/development/management/principal-engineer/",
      },
    ],
  },
  glue: {
    title: "Glue work",
    description:
      "The work that holds a project together and rarely shows in a PR. Count it, but not only it.",
    examples: ["Onboarding", "Coordination", "Docs", "Unblocking"],
    items: [
      {
        q: "Glue work is the difference between a project that succeeds and one that fails.",
        who: "Tanya Reilly, Being Glue",
        url: "https://noidea.dog/glue",
      },
      {
        q: "If you only do glue, you will only get better at glue.",
        who: "Tanya Reilly",
        url: "https://noidea.dog/glue",
      },
      {
        q: "You should do this kind of extra work for the projects you lead",
        who: "Sean Goedecke",
        url: "https://www.seangoedecke.com/glue-work-considered-harmful/",
      },
    ],
  },
  counterfactual: {
    title: "Without you, would it have happened?",
    description:
      "The question you answer for each thread in review: would this have happened without you?",
    examples: ["Wouldn't happen", "Slower", "Same"],
    items: [
      {
        q: "things that simply won't happen if you don't do them are your biggest opportunity to work on something that matters",
        who: "Will Larson",
        url: "https://staffeng.com/guides/work-on-what-matters/",
      },
      {
        q: "you won't get promoted if your company's leadership doesn't know who you are.",
        who: "Will Larson, Getting the title where you are",
        url: "https://staffeng.com/guides/getting-the-title-where-you-are/",
      },
    ],
  },
  scope: {
    title: "Scope",
    description: "Scope grows with level: your team, then several teams, then a company goal.",
    examples: ["Your team", "Across teams", "Company goal"],
    items: [
      {
        q: "While a senior engineer typically works across a team, a Staff or Principal engineer usually works across a larger organization.",
        who: "Gergely Orosz",
        url: "https://newsletter.pragmaticengineer.com/p/engineering-career-paths",
      },
      {
        q: "Principal Engineers and Senior Directors of Engineering primarily focus on the engineering output of multiple groups",
        who: "Mike McQuaid",
        url: "https://mikemcquaid.com/what-is-a-staff-plus-principal-engineer/",
      },
      {
        q: "I deliver results against a strategic company-level business objective",
        who: "Dropbox, IC6",
        url: "https://dropbox.github.io/dbx-career-framework/ic6_principal_software_engineer.html",
      },
    ],
  },
  tracking: {
    title: "Track the work",
    description:
      "Write the work down while it happens, so your manager can advocate for you. This app is that log.",
    examples: ["Brag doc", "Work log"],
    items: [
      {
        q: "So if your manager is going to effectively advocate for you, they need help.",
        who: "Julia Evans, Brag documents",
        url: "https://jvns.ca/blog/brag-documents/",
      },
      {
        q: "Engineers who know all their work have an easier way of saying no to new work",
        who: "Gergely Orosz, Work log",
        url: "https://blog.pragmaticengineer.com/work-log-template-for-software-engineers/",
      },
      {
        q: "can take on massive ambiguous cross-org projects and make them succeed despite the difficulty.",
        who: "Tanya Reilly, The Staff Engineer's Path",
        url: "https://noidea.dog/staff",
      },
    ],
  },
};
