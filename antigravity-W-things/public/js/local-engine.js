/**
 * Rockstar Core — offline assistant
 *
 * A deterministic, privacy-friendly fallback used when the user has not added
 * an Astra key. It is intentionally honest: it is a local knowledge engine,
 * not a hidden cloud LLM. It handles common developer, web, API, database,
 * app-help, creator, math and productivity questions and can reason over text
 * attachments without any external request.
 */
const RockstarCore = (() => {
  const creator = {
    name: 'Aseebdev (Abdul Aseeb)',
    role: 'Full-Stack MERN Developer • Cloud + AI Integration',
    linkedin: 'https://www.linkedin.com/in/aseebdev/',
  };

  const KB = [
    ['javascript', 'JavaScript is a programming language used to make web pages and applications interactive. It runs in browsers and also on servers with Node.js. Core areas include variables, functions, objects, arrays, the DOM, asynchronous programming, modules and APIs.'],
    ['array', 'An array is an ordered, zero-indexed collection of values. Common methods include map() to transform, filter() to select, reduce() to accumulate, and forEach() to perform an action for each element.'],
    ['map', 'map() creates a new array by running a callback once for every element. Example: const doubled = [1,2,3].map(n => n * 2); // [2,4,6]. It does not mutate the original array unless your callback mutates referenced objects.'],
    ['filter', 'filter() creates a new array containing only elements for which the callback returns a truthy value. Example: const evens = [1,2,3,4].filter(n => n % 2 === 0);'],
    ['reduce', 'reduce() processes an array into one accumulated result. Example: const total = [10,20,30].reduce((sum, n) => sum + n, 0); // 60. The second argument is the initial accumulator value.'],
    ['foreach', 'forEach() runs a callback for every array element and is normally used for side effects such as logging or updating another system. It returns undefined, unlike map(), which returns a new array.'],
    ['callback', 'A callback is a function passed to another function so it can be called later or at a particular point in a process. Array methods, timers and many asynchronous APIs use callbacks.'],
    ['closure', 'A closure happens when a function remembers and can access variables from its surrounding lexical scope even after the outer function has finished executing.'],
    ['hoisting', 'Hoisting describes how JavaScript declarations are processed before execution. Function declarations can be called before their source line; var is initialized as undefined; let and const are hoisted but remain inaccessible in the temporal dead zone until initialization.'],
    ['this', 'this is determined by how a function is called. In an object method it commonly refers to the receiver object; with new it refers to the new instance; arrow functions do not create their own this and capture it lexically.'],
    ['async await', 'async functions return Promises. await pauses that async function until a Promise settles, making asynchronous control flow easier to read. Use try/catch for rejected Promises.'],
    ['promise', 'A Promise represents the eventual result of an asynchronous operation. It can be pending, fulfilled or rejected and can be consumed with then/catch or async/await.'],
    ['dom', 'The DOM is the browser representation of an HTML document as a tree of nodes. JavaScript can select nodes, read or change content/attributes/styles and attach event listeners.'],
    ['event listener', 'addEventListener() registers a function to run when a specified event occurs. Example: button.addEventListener("click", () => console.log("clicked"));'],
    ['node', 'Node.js is a JavaScript runtime built on the V8 engine. It lets JavaScript run outside the browser and is widely used for servers, APIs, CLIs, automation and tooling.'],
    ['express', 'Express is a minimalist Node.js web framework commonly used to build HTTP servers and REST APIs. Routes map HTTP methods and paths to handler functions, and middleware can process requests before handlers.'],
    ['api', 'An API is a defined interface through which software components communicate. A web API commonly exposes HTTP endpoints, accepts structured requests such as JSON, authenticates clients and returns structured responses.'],
    ['rest', 'REST is an architectural style for networked resources. Typical HTTP mappings are GET for reading, POST for creating, PUT/PATCH for updating and DELETE for deleting. REST itself is not a programming language or framework.'],
    ['http', 'HTTP is the application protocol used by the web. A request contains a method, URL, headers and optionally a body; the server responds with a status code, headers and optionally a body.'],
    ['status code', 'HTTP status codes are grouped as 1xx informational, 2xx success, 3xx redirection, 4xx client-side/request errors and 5xx server-side errors. 200 means success, 201 creation, 400 bad request, 401 authentication required/failed, 403 forbidden, 404 not found and 500 server error.'],
    ['json', 'JSON is a text data format built from objects, arrays, strings, numbers, booleans and null. JavaScript commonly converts JSON with JSON.parse() and JSON.stringify().'],
    ['database', 'A database stores and retrieves structured or unstructured data. PostgreSQL and MySQL are relational databases; MongoDB is a document database.'],
    ['postgresql', 'PostgreSQL is an open-source relational database system with SQL, transactions, constraints, indexes, joins, JSON support and strong consistency features.'],
    ['sql', 'SQL is used to query and manipulate relational databases. Common operations include SELECT, INSERT, UPDATE and DELETE, with WHERE, JOIN, GROUP BY, ORDER BY and aggregate functions such as COUNT and SUM.'],
    ['supabase', 'Supabase is a hosted platform built around PostgreSQL with database, authentication, storage and other developer services. A Node backend can connect to its PostgreSQL database using a connection string.'],
    ['mongodb', 'MongoDB is a document-oriented database that stores records as BSON documents. It is commonly used with Node.js and Express in MERN applications.'],
    ['react', 'React is a JavaScript library for building user interfaces from reusable components. State changes trigger rendering, and hooks such as useState and useEffect are commonly used in function components.'],
    ['mern', 'MERN stands for MongoDB, Express, React and Node.js. It is a common full-stack JavaScript stack where React handles the UI and Node/Express provides backend APIs.'],
    ['html', 'HTML defines the structure and meaning of a web page. Semantic elements such as header, nav, main, section, article, footer and button improve structure and accessibility.'],
    ['css', 'CSS controls presentation and layout. Flexbox is ideal for one-dimensional layouts, Grid for two-dimensional layouts, media queries for responsive behavior, and pseudo-classes/elements for state and generated content.'],
    ['flexbox', 'Flexbox lays out items along a main axis and cross axis. display:flex activates it; justify-content controls the main axis and align-items controls the cross axis.'],
    ['git', 'Git is a distributed version-control system. A typical workflow is git status → git add → git commit → git push. Branches isolate work and merges combine histories.'],
    ['github', 'GitHub hosts Git repositories and adds collaboration features such as pull requests, issues, actions and code review.'],
    ['jwt', 'A JWT is a signed token format often used for stateless authentication. It commonly contains a header, payload and signature. Never put passwords or other secrets in the payload.'],
    ['authentication', 'Authentication answers “who are you?” Authorization answers “what are you allowed to do?” Passwords should be salted and hashed with a password-hashing algorithm such as bcrypt or Argon2, not stored as plaintext.'],
    ['session', 'A session keeps server-side or signed authentication state associated with a browser. A secure production session should use HTTPS, an HttpOnly cookie, appropriate SameSite settings and a strong unpredictable secret.'],
    ['api key', 'An API key is a credential used by an application to authenticate to an API. Treat it like a password: do not publish it in source code, Git repositories or screenshots. Rockstar AI uses BYOK so each user supplies their own Astra key.'],
    ['byok', 'BYOK means Bring Your Own Key. Each user supplies their own provider API key, so provider usage is charged to or limited by that user’s provider account rather than a shared owner key.'],
    ['cloud', 'Cloud computing means using remotely hosted compute, storage, databases or services over a network. A typical web app can use a frontend, a Node backend and a managed PostgreSQL database.'],
    ['security', 'Basic web security includes HTTPS, secure cookies, password hashing, input validation, parameterized SQL, rate limiting, CSRF/XSS protections where applicable, secret management and least-privilege access.'],
    ['xss', 'Cross-site scripting (XSS) occurs when untrusted content is interpreted as executable script in a browser. Escape untrusted HTML, avoid unsafe innerHTML, validate input and use a strong Content Security Policy where appropriate.'],
    ['sql injection', 'SQL injection occurs when untrusted input changes the structure of a SQL query. Parameterized queries or prepared statements prevent the input from becoming SQL syntax.'],
    ['streaming', 'Streaming sends a response incrementally rather than waiting for the entire response. For AI chat, SSE or another streaming protocol can display generated text token-by-token or chunk-by-chunk.'],
    ['sse', 'Server-Sent Events (SSE) is a one-way streaming mechanism from server to browser over HTTP. It is useful for streaming AI output to a web UI.'],
    ['cors', 'CORS controls which browser origins can make cross-origin requests. It is enforced by browsers; server-to-server requests are not blocked by browser CORS rules.'],
    ['dotenv', 'dotenv loads environment variables from a .env file into process.env during local development. Never commit real secrets in .env to a public repository.'],
    ['npm', 'npm is the Node.js package manager. npm install installs dependencies, npm start runs the package start script, and npm scripts can automate project tasks.'],
    ['typescript', 'TypeScript is JavaScript with a static type system and additional language features. It is compiled/transpiled into JavaScript that can run in browsers or Node.js.'],
    ['algorithm', 'An algorithm is a finite, well-defined sequence of steps for solving a problem. Good algorithm design considers correctness, time complexity, space complexity and edge cases.'],
    ['complexity', 'Big-O notation describes how an algorithm’s resource usage grows with input size. O(1) is constant, O(log n) grows logarithmically, O(n) linearly and O(n²) quadratically.'],
    ['recursion', 'Recursion is when a function calls itself on a smaller or simpler problem. A correct recursive solution needs a base case and progress toward that base case.'],
    ['array methods', 'Useful JavaScript array methods: map transforms, filter selects, reduce accumulates, forEach performs side effects, find returns the first matching element, some tests whether any match, every tests whether all match, includes checks membership, and sort orders elements in place.'],
    ['event loop', 'The JavaScript event loop coordinates synchronous execution with asynchronous callbacks and Promise jobs. JavaScript runs one main call stack at a time, while the environment handles timers, I/O and other asynchronous work.'],
    ['gitignore', '.gitignore tells Git which files or directories should not be tracked. Secrets such as .env files commonly belong in .gitignore.'],
    ['markdown', 'Markdown is a lightweight markup syntax for headings, lists, emphasis, links, code blocks and other formatted text.'],
    ['regex', 'A regular expression is a pattern used to search, validate or transform text. JavaScript supports regex literals such as /pattern/i and the RegExp object.'],
    ['debugging', 'A practical debugging loop is reproduce → isolate → inspect inputs/state → form a hypothesis → make one change → retest → add a regression check. Browser DevTools Network and Console panels are especially useful for web apps.'],
    ['rockstar ai', 'Rockstar AI is a personal ChatGPT-style interface created by Aseebdev. It supports accounts, conversation history, themes and BYOK Astra models. Without an Astra key it uses Rockstar Core, the local offline assistant.'],
  ];


  // Broader offline reference layer. This is intentionally deterministic and honest:
  // it improves common-answer coverage but does not pretend to be a general cloud LLM.
  KB.push(
    ['python', 'Python is a general-purpose programming language known for readable syntax and a large ecosystem. It is widely used for automation, backend services, data work, AI/ML, scripting and education.'],
    ['docker', 'Docker packages an application and its dependencies into containers. A Dockerfile describes the image build, while a container is a running instance of an image.'],
    ['linux', 'Linux is a family of open-source Unix-like operating systems. Common command-line tools include pwd, ls, cd, cp, mv, rm, grep, find, cat, chmod and systemctl.'],
    ['tcp ip', 'TCP/IP is the protocol suite used by the Internet. IP handles addressing and routing; TCP provides reliable ordered delivery between endpoints.'],
    ['dns', 'DNS translates domain names such as example.com into network addresses such as IP addresses. A browser normally uses DNS before connecting to the destination server.'],
    ['websocket', 'WebSocket provides a persistent, bidirectional connection between a client and server, making it useful for real-time features such as chat, collaboration and live dashboards.'],
    ['graphql', 'GraphQL is an API query language and runtime where clients request the fields they need. Unlike a typical REST API, a GraphQL API often exposes a schema and a query endpoint.'],
    ['redis', 'Redis is an in-memory data store commonly used for caching, sessions, rate limiting, queues and fast key-value operations.'],
    ['cache', 'A cache stores reusable data closer to the code that needs it so repeated work can be avoided. Good cache design considers invalidation, expiration, consistency and memory limits.'],
    ['queue', 'A job queue separates request handling from background work. A producer adds jobs, and workers process them asynchronously. Queues help with retries, bursts and long-running tasks.'],
    ['cron', 'Cron is a scheduler for recurring jobs on Unix-like systems. A cron expression defines when a command should run.'],
    ['ci cd', 'CI/CD automates software validation and delivery. Continuous integration runs tests/builds on changes; continuous delivery or deployment moves validated changes toward production.'],
    ['testing', 'Software testing checks behavior against expected results. Unit tests target small pieces, integration tests verify components together, and end-to-end tests exercise real user flows.'],
    ['unit test', 'A unit test checks a small isolated unit such as a function. Good unit tests are deterministic, focused and fast.'],
    ['integration test', 'An integration test checks how multiple components work together, such as an API route interacting with a database.'],
    ['e2e', 'End-to-end testing verifies a complete workflow from the user-facing entry point through the relevant backend and data layers.'],
    ['serverless', 'Serverless computing runs application code on managed infrastructure without requiring the developer to manage long-lived servers. Functions are commonly invoked by HTTP requests or events.'],
    ['vercel', 'Vercel is a cloud platform commonly used for deploying web applications and serverless functions. A project can connect to Git and automatically deploy commits.'],
    ['environment variable', 'An environment variable is configuration supplied outside source code, often through process.env in Node.js. Secrets should be stored in the deployment platform rather than committed to Git.'],
    ['cookie', 'A cookie is browser-managed data associated with a website. Authentication cookies should normally use Secure and HttpOnly, with an appropriate SameSite policy.'],
    ['csrf', 'CSRF tricks a browser into sending an unwanted authenticated request. Common defenses include SameSite cookies, CSRF tokens and strict origin validation where applicable.'],
    ['csp', 'Content Security Policy is a browser security mechanism that restricts which resources can execute or load. A strong CSP can reduce the impact of XSS.'],
    ['https', 'HTTPS is HTTP protected by TLS. It encrypts traffic in transit and authenticates the server using certificates.'],
    ['cdn', 'A CDN distributes cached content across geographically distributed edge locations so users can receive static assets from a nearby point of presence.'],
    ['orm', 'An ORM maps application objects or models to database tables or records. It can improve developer productivity but does not remove the need to understand SQL and database behavior.'],
    ['prisma', 'Prisma is a TypeScript/Node.js ORM and database toolkit with a schema, generated client and migration workflow.'],
    ['mongoose', 'Mongoose is a Node.js ODM commonly used with MongoDB. It provides schemas, models, validation and middleware around MongoDB documents.'],
    ['ai', 'Artificial intelligence is the broad field of building systems that perform tasks associated with perception, reasoning, prediction, generation or decision-making.'],
    ['machine learning', 'Machine learning trains models from data so they can make predictions or decisions rather than relying only on explicitly written rules.'],
    ['llm', 'A large language model is a neural model trained on large amounts of text to predict and generate language. Chat assistants use additional prompting, tooling and application logic around the model.'],
    ['token', 'A token is a unit used by a language model to represent pieces of text. Token counts affect context size, latency and provider usage.'],
    ['temperature', 'Temperature controls the randomness of probabilistic generation. Lower values generally produce more consistent output; higher values generally allow more variation.'],
    ['embedding', 'An embedding is a numeric vector representation of data such as text. Similar meanings can be compared by measuring distance or similarity between vectors.'],
    ['rag', 'Retrieval-Augmented Generation (RAG) retrieves relevant external content and supplies it to a language model as context before generation.'],
    ['vector database', 'A vector database stores vector embeddings and supports similarity search. It is commonly used for semantic retrieval in RAG systems.'],
    ['prompt', 'A prompt is the input/context supplied to a generative AI model. Good prompts define the task, constraints, relevant context and desired output format.'],
    ['hallucination', 'In AI, a hallucination is generated content that is presented as factual but is unsupported or incorrect. Important facts should be verified against reliable sources.'],
    ['fine tuning', 'Fine-tuning adapts a pretrained model by training it further on a targeted dataset. It differs from prompting and RAG, which do not change the model weights.'],
    ['inference', 'Inference is the process of using a trained model to produce an output from an input. For language models, inference is the generation phase.'],
    ['gpu', 'A GPU is a processor designed for highly parallel computation. GPUs are widely used for graphics and for accelerating machine-learning workloads.'],
    ['algorithm sorting', 'Sorting algorithms arrange values according to an ordering rule. Common examples include insertion sort, merge sort, quicksort and heap sort, with different time and space tradeoffs.'],
    ['binary search', 'Binary search finds a value in a sorted collection by repeatedly halving the search range. Its time complexity is O(log n).'],
    ['data structure', 'A data structure organizes data for efficient access and modification. Arrays, linked lists, stacks, queues, hash tables, trees and graphs are common examples.'],
    ['object', 'A JavaScript object is a collection of properties. Properties can hold primitive values, arrays, objects or functions. Objects are commonly used to represent structured data.'],
    ['prototype', 'JavaScript objects can inherit properties through the prototype chain. Constructor functions and classes use prototypes for shared methods.'],
    ['destructuring', 'Destructuring extracts values from arrays or properties from objects into variables. It supports defaults and renaming, for example const {name: userName} = user.'],
    ['spread', 'The spread syntax expands iterable elements or object properties into a new array, argument list or object. It is commonly used for shallow copies and composition.'],
    ['rest parameter', 'A rest parameter collects remaining function arguments into an array, for example function sum(...numbers) { ... }.'],
    ['optional chaining', 'Optional chaining ?. safely accesses nested properties or calls when an earlier value may be null or undefined.'],
    ['nullish coalescing', 'The nullish coalescing operator ?? uses a fallback only when the left side is null or undefined, unlike || which also treats other falsy values as missing.'],
    ['module', 'A JavaScript module is a file with its own scope that can export values and import values from other modules. Modern Node.js and browsers support ES modules.'],
    ['package json', 'package.json describes a Node.js project, including its name, scripts, dependencies and other metadata.'],
    ['semantic html', 'Semantic HTML uses elements according to their meaning, such as nav, main, article and button. It improves accessibility, structure and maintainability.'],
    ['media query', 'A CSS media query applies styles conditionally based on characteristics such as viewport width, enabling responsive layouts.'],
    ['grid', 'CSS Grid is a two-dimensional layout system for arranging elements across rows and columns.'],
    ['animation', 'CSS animations use keyframes to interpolate property changes over time. Transitions animate changes between two states.'],
    ['accessibility', 'Web accessibility means making interfaces usable by people with different abilities. Semantic HTML, keyboard access, labels, focus states and sufficient contrast are core practices.']
  );

  function modeAnswer() {
    return `**Rockstar Core is active — offline mode.**\n\nNo Astra API key is currently connected for this account, so this reply is coming from the built-in offline knowledge engine.\n\nAdd your Astra API key in **Settings → API & Model** to switch new messages to your selected Astra AI model.`;
  }

  const entries = KB.map(([k, v]) => ({ key: k, text: v }));

  function normalize(q) {
    return String(q || '').toLowerCase().replace(/[^a-z0-9+.#/\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function creatorAnswer() {
    return `Rockstar AI was created by **Aseebdev (Abdul Aseeb)**, a **Full-Stack MERN Developer • Cloud + AI Integration**.\n\nHe is available on LinkedIn: https://www.linkedin.com/in/aseebdev/\n\nA small creator note: he loves his brother **Abdul Ajmal** and his future wife **Princy / Pathu**. ❤️`;
  }

  function keyAnswer() {
    return `You're currently using **Rockstar Core**, the built-in offline assistant. No Astra key is required for this mode.\n\nTo unlock the full external AI model, add **your own Astra API key** in **Settings → API & Model**. The key is encrypted and saved to your account so you do not need to enter it again after login. You can remove it anytime in Settings.\n\nOnce a key is added, Rockstar automatically routes new questions to your selected Astra model.`;
  }

  function appAnswer() {
    return `**Rockstar AI modes**\n\n• **Rockstar Core** — works without an API key using the site's built-in offline knowledge engine.\n• **Astra model** — activated automatically when you add your own Astra API key.\n• **BYOK** — your Astra usage stays tied to your own provider key.\n\nYou can change themes, model and other behavior from Settings.`;
  }

  function calculate(q) {
    const candidate = String(q).replace(/^(what is|calculate|compute|solve|evaluate)\s+/i, '').trim();
    if (!candidate || !/^[0-9+\-*/().%\s]+$/.test(candidate) || !/[+\-*/%]/.test(candidate)) return null;
    try {
      const value = Function(`"use strict"; return (${candidate})`)();
      if (typeof value === 'number' && Number.isFinite(value)) return `**Result:** ${value}`;
    } catch (_) {}
    return null;
  }

  function codeExample(q) {
    if (/map\(\)|use map|map method|map in javascript/.test(q)) return `**map() example**\n\n\`\`\`js\nconst numbers = [1, 2, 3, 4];\nconst doubled = numbers.map(n => n * 2);\n\nconsole.log(doubled); // [2, 4, 6, 8]\n\`\`\`\n\n**Idea:** map() transforms every element and returns a new array.`;
    if (/filter\(\)|use filter|filter method|filter in javascript/.test(q)) return `**filter() example**\n\n\`\`\`js\nconst numbers = [1, 2, 3, 4, 5, 6];\nconst evens = numbers.filter(n => n % 2 === 0);\n\nconsole.log(evens); // [2, 4, 6]\n\`\`\`\n\n**Idea:** filter() keeps elements whose callback returns true/truthy.`;
    if (/reduce\(\)|use reduce|reduce method|reduce in javascript/.test(q)) return `**reduce() example**\n\n\`\`\`js\nconst prices = [100, 200, 50];\nconst total = prices.reduce((sum, price) => sum + price, 0);\n\nconsole.log(total); // 350\n\`\`\`\n\n**Idea:** reduce() turns many values into one accumulated result.`;
    if (/foreach|for each/.test(q) && /example|code|javascript/.test(q)) return `\`\`\`js\nconst names = ['Aseeb', 'Ajmal', 'Pathu'];\n\nnames.forEach(name => {\n  console.log(name);\n});\n\`\`\`\n\nforEach() executes the callback once for each element and returns undefined.`;
    if (/callback.*example|example.*callback/.test(q)) return `\`\`\`js\nfunction runTask(callback) {\n  callback('Task completed');\n}\n\nrunTask(message => {\n  console.log(message);\n});\n\`\`\`\n\nHere, the arrow function is the callback passed to runTask().`;
    if (/async.*await|await.*async/.test(q)) return `\`\`\`js\nasync function loadUser() {\n  try {\n    const response = await fetch('/api/user');\n    const user = await response.json();\n    return user;\n  } catch (error) {\n    console.error(error);\n  }\n}\n\`\`\`\n\nawait pauses the async function until the Promise settles.`;
    if (/express.*server|node.*server|basic.*api/.test(q)) return `\`\`\`js\nconst express = require('express');\nconst app = express();\n\napp.use(express.json());\n\napp.get('/api/hello', (req, res) => {\n  res.json({ message: 'Hello from Rockstar Core' });\n});\n\napp.listen(3000, () => console.log('Server running on 3000'));\n\`\`\``;
    return null;
  }

  function attachmentAnswer(attachments) {
    const textFiles = (attachments || []).filter(a => a.kind === 'text');
    const images = (attachments || []).filter(a => a.kind === 'image');
    const parts = [];
    if (textFiles.length) {
      for (const a of textFiles) {
        const text = String(a.text || '');
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const headings = text.split(/\n/).filter(line => /^\s{0,3}#{1,6}\s+/.test(line)).slice(0, 8);
        parts.push(`**${a.name}** — ${words.toLocaleString()} words, ${text.length.toLocaleString()} characters.${headings.length ? `\nHeadings: ${headings.join(' • ')}` : ''}\n\nPreview:\n> ${text.trim().slice(0, 900).replace(/\n/g, '\n> ')}${text.length > 900 ? '…' : ''}`);
      }
    }
    if (images.length) parts.push(`I received ${images.length} image${images.length === 1 ? '' : 's'}. **Rockstar Core is offline and cannot perform true visual understanding without an AI vision model.** Add your Astra key to analyze image contents.`);
    return parts.join('\n\n') || null;
  }

  function generate(input, attachments = []) {
    const q = normalize(input);
    if (attachments?.length && !q) return attachmentAnswer(attachments);
    if (/who (created|made|built)|who is aseebdev|who is abdul aseeb|creator|developer of rockstar|who owns rockstar/.test(q)) return creatorAnswer();
    if (/linkedin|linked in|aseebdev profile/.test(q)) return `Aseebdev's LinkedIn profile: https://www.linkedin.com/in/aseebdev/`;
    if (/which mode|what mode|current mode|mode.*now|which ai|what ai.*using|are you offline|offline mode/.test(q)) return modeAnswer();
    if (/(can you|could you|do you|is it|are you|what can you|how can i|how do i|what images can you).*(generate|create|make|draw|edit|image|images|picture|photo)/.test(q) || /(image generation|image tool).*(possible|available|supported)/.test(q)) return `Yes — **Rockstar AI can generate and edit images** using its connected image-generation tool.\n\nWhen you explicitly ask me to **generate/create/draw an image**, Rockstar routes that request to the image tool. Normal questions about images stay in the regular text conversation.`;
    if (/api key|astra key|add.*key|without.*key|no.*key|remove.*key|key.*removed/.test(q)) return keyAnswer();
    if (/what is rockstar|rockstar ai|how does rockstar work|about this (site|website|app)/.test(q)) return appAnswer();

    const calc = calculate(input);
    if (calc) return calc;
    const example = codeExample(q);
    if (example) return example;

    // Prefer longer/more specific terms first.
    const matches = entries.filter(e => q.includes(e.key) || e.key.split(' ').every(part => q.includes(part)));
    if (matches.length) {
      const best = matches.sort((a, b) => b.key.length - a.key.length)[0];
      const title = best.key.replace(/\b\w/g, c => c.toUpperCase());
      return `**${title}**\n\n${best.text}\n\n*Rockstar Core • offline mode*`;
    }

    const attachment = attachmentAnswer(attachments);
    if (attachment) return attachment;

    return `I can help with this in **Rockstar Core**, the site's offline knowledge engine. I don't have a cloud language model connected right now, so I won't pretend that I do.\n\nTry asking me about **JavaScript, HTML, CSS, Node.js, Express, React, MERN, APIs, HTTP, PostgreSQL, SQL, MongoDB, Git, authentication, web security, algorithms, debugging, Rockstar AI, or your attached text files**.\n\nFor broad open-domain reasoning, current information, deep document/image analysis and the full AI model, add your **own Astra API key** in **Settings → API & Model**.`;
  }

  return { generate, creator };
})();

window.RockstarCore = RockstarCore;
