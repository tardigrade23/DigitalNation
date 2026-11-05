'use strict';

/* =========================================================
 * Tech Encyclopedia: one card per sector and research project.
 *   what: what the technology is
 *   real: a real-world example (country / year)
 *   fact: a "Did you know?" fact
 *   q, a, c: quiz question, three answers, index of the correct one
 * Keep facts conservative and well documented. Answer order is
 * shuffled in the game, so the correct answer may be listed first.
 * ========================================================= */

const LIBRARY = {
  /* ---------- Sectors ---------- */
  isp: {
    what: 'An internet service provider connects homes, schools and businesses to the internet over cable, fiber, mobile or satellite links.',
    real: 'One of the first commercial dial-up internet providers, The World, opened to the public in the United States in 1989.',
    fact: 'More than 5 billion people, about two thirds of humanity, now use the internet (International Telecommunication Union).',
    q: 'What does ISP stand for?', a: ['Internet Service Provider', 'Internal System Protocol', 'International Server Port'], c: 0,
  },
  egov: {
    what: 'An e-government portal puts public services such as applications, certificates and payments in one online place, so citizens do not have to visit offices.',
    real: 'Estonia\'s X-Road system, launched in 2001, lets government databases exchange data securely, so citizens rarely have to give the state the same information twice.',
    fact: 'Azerbaijan\'s ASAN Xidmət centers, opened in 2012, bring services from many agencies under one roof, and the model has received a United Nations Public Service Award.',
    q: 'Which country built the X-Road data exchange system?', a: ['Estonia', 'Japan', 'Canada'], c: 0,
  },
  mbank: {
    what: 'Mobile banking lets people pay, save and transfer money with a phone, even where there are few bank branches.',
    real: 'M-Pesa, launched in Kenya in 2007, let people send money by text message and became one of the world\'s best-known mobile money services.',
    fact: 'Mobile money helped hundreds of millions of adults in developing countries open their first financial account (World Bank Global Findex).',
    q: 'Which mobile money service launched in Kenya in 2007?', a: ['M-Pesa', 'PayPal', 'Alipay'], c: 0,
  },
  fiber: {
    what: 'A fiber backbone carries huge amounts of data between cities and countries as pulses of light inside thin glass fibers.',
    real: 'Undersea fiber-optic cables carry the vast majority of data traveling between continents; satellites carry only a small share.',
    fact: 'Light in an optical fiber travels at about two thirds of its speed in a vacuum, roughly 200,000 km per second.',
    q: 'What carries the data inside an optical fiber?', a: ['Light', 'Electric current', 'Radio waves'], c: 0,
  },
  fintech: {
    what: 'Fintech companies use software to offer financial services such as payments, lending and investing faster and more cheaply.',
    real: 'In 2016 the UK\'s Financial Conduct Authority opened one of the first regulatory sandboxes, where fintech startups test products with real customers under supervision.',
    fact: 'Many countries have copied the sandbox idea, so regulators can learn about new technology before writing rules.',
    q: 'What is a regulatory sandbox?', a: ['A supervised space to test new financial products', 'A cloud server for banks', 'A type of cryptocurrency'], c: 0,
  },
  dc: {
    what: 'Data centers are buildings full of servers that store data and run the apps and websites people use every day.',
    real: 'The International Energy Agency estimates that data centers use roughly 1 to 1.5 percent of the world\'s electricity.',
    fact: 'Cooling is one of the biggest costs of a data center, so many are built in cold climates such as the Nordic countries.',
    q: 'Besides electricity, what do data centers need most to keep servers running?', a: ['Cooling', 'Paper', 'Daylight'], c: 0,
  },
  digid: {
    what: 'A digital ID lets people prove who they are online, sign documents and use services securely with a card, phone or code.',
    real: 'India\'s Aadhaar program gives residents a 12-digit identity number linked to fingerprints and iris scans, and more than a billion people are enrolled.',
    fact: 'Estonia\'s chip-based ID card, introduced in 2002, lets citizens sign documents digitally with the same legal weight as a handwritten signature.',
    q: 'How many digits does an Aadhaar number have?', a: ['12', '8', '16'], c: 0,
  },
  g5: {
    what: '5G is the fifth generation of mobile networks. It offers higher speeds, lower delay and room for far more connected devices than 4G.',
    real: 'South Korea launched the world\'s first nationwide commercial 5G service in April 2019.',
    fact: 'Low delay (latency) matters for things like remote surgery, factory robots and self-driving cars.',
    q: 'What does the "G" in 5G stand for?', a: ['Generation', 'Gigabit', 'Global'], c: 0,
  },
  opendata: {
    what: 'An open data portal publishes government data, such as transport, weather or budgets, for anyone to use for free.',
    real: 'The United States launched data.gov in 2009 and the United Kingdom launched data.gov.uk in 2010.',
    fact: 'Developers use open transport data to build route-planning apps, often faster than governments could build them.',
    q: 'What is "open data"?', a: ['Data anyone can freely use and share', 'Data that is encrypted', 'Data stored only on paper'], c: 0,
  },
  cloud: {
    what: 'A cloud platform rents computing power and storage over the internet, so organizations do not need to run their own servers.',
    real: 'Amazon Web Services launched its first public cloud services, S3 storage and EC2 computing, in 2006.',
    fact: 'Many governments follow a "cloud first" policy: they consider cloud services before buying their own hardware.',
    q: 'What does "the cloud" mean in computing?', a: ['Computing resources delivered over the internet', 'Weather satellites', 'Wireless charging'], c: 0,
  },
  pay: {
    what: 'Instant payment systems move money between bank accounts in seconds, at any time of day, often by scanning a QR code.',
    real: 'India\'s UPI, launched in 2016, now handles billions of payments every month, and Brazil\'s Pix, launched in 2020, was adopted by most Brazilian adults within a few years.',
    fact: 'Instant payments can lower costs for small shops, because their fees are usually much lower than card fees.',
    q: 'What is the name of Brazil\'s instant payment system?', a: ['Pix', 'UPI', 'Swish'], c: 0,
  },
  ehealth: {
    what: 'E-health services let doctors and patients share records, book visits and get prescriptions online.',
    real: 'Estonia introduced nationwide digital prescriptions in 2010; patients collect their medicine at a pharmacy just by showing an ID.',
    fact: 'Shared health records help doctors avoid repeating tests and spot dangerous drug combinations.',
    q: 'What does EHR stand for?', a: ['Electronic Health Record', 'Emergency Hospital Room', 'External Heart Rate'], c: 0,
  },
  iot: {
    what: 'The Internet of Things connects everyday objects, such as meters, lights and sensors, so they can send data and be controlled remotely.',
    real: 'The term "Internet of Things" was coined by Kevin Ashton in 1999.',
    fact: 'Smart water meters can detect leaks automatically, saving water and money.',
    q: 'What does IoT stand for?', a: ['Internet of Things', 'Input/Output Terminal', 'Integrated Online Trade'], c: 0,
  },
  smart: {
    what: 'A smart city uses sensors and data to run traffic, energy, water and public services more efficiently.',
    real: 'Singapore launched its Smart Nation initiative in 2014 to use digital technology across government and daily life.',
    fact: 'Adaptive traffic lights that react to real-time traffic can shorten journeys without building new roads.',
    q: 'Which country launched the "Smart Nation" initiative in 2014?', a: ['Singapore', 'Norway', 'Chile'], c: 0,
  },
  edu: {
    what: 'E-education brings lessons, textbooks and exams online, so students can learn anywhere.',
    real: 'Coursera and edX, two of the best-known platforms for massive open online courses, were both founded in 2012.',
    fact: 'When schools closed during COVID-19 in 2020, more than 1.5 billion students worldwide were affected, pushing schools online almost overnight (UNESCO).',
    q: 'What does MOOC stand for?', a: ['Massive Open Online Course', 'Mobile Office Operating Code', 'Multi-Option Online Classroom'], c: 0,
  },
  ai: {
    what: 'An AI lab builds systems that learn from data to recognize images, understand language and make predictions.',
    real: 'The term "artificial intelligence" was coined for a 1956 workshop at Dartmouth College organized by John McCarthy and others.',
    fact: 'Many countries now publish national AI strategies; Canada released one of the first in 2017.',
    q: 'When was the term "artificial intelligence" coined for the Dartmouth workshop?', a: ['1956', '1984', '2001'], c: 0,
  },
  robotics: {
    what: 'Robots are machines that sense their surroundings and carry out physical tasks, from welding cars to delivering parcels.',
    real: 'The word "robot" comes from Karel Čapek\'s 1920 play R.U.R.; it is based on the Czech word "robota", meaning forced labor.',
    fact: 'South Korea has one of the highest numbers of industrial robots per factory worker in the world (International Federation of Robotics).',
    q: 'Where does the word "robot" come from?', a: ['A Czech play from 1920', 'A NASA mission', 'A Japanese cartoon'], c: 0,
  },
  auto: {
    what: 'Autonomous transport uses sensors and AI so cars, buses and trucks can drive with little or no human help.',
    real: 'Engineers use the SAE scale of driving automation, which runs from Level 0 (no automation) to Level 5 (full automation).',
    fact: 'Driverless robotaxi services already carry paying passengers in some cities, such as Phoenix and San Francisco in the United States.',
    q: 'How many levels does the SAE driving automation scale have?', a: ['Six (0 to 5)', 'Three', 'Ten'], c: 0,
  },
  chip: {
    what: 'A semiconductor fab is a factory that makes computer chips by printing billions of tiny transistors onto silicon wafers.',
    real: 'In 1965 Gordon Moore predicted that the number of transistors on a chip would keep doubling at a steady pace; this became known as Moore\'s law.',
    fact: 'Taiwan\'s TSMC is the world\'s largest contract chipmaker, producing chips designed by many other companies.',
    q: 'What is Moore\'s law about?', a: ['The number of transistors on a chip', 'Internet download speeds', 'The battery life of phones'], c: 0,
  },
  quantum: {
    what: 'Quantum computers use qubits, which can be in a mix of 0 and 1 at the same time, to solve certain problems much faster than ordinary computers.',
    real: 'In 2019 Google reported that its 53-qubit Sycamore processor finished a specific calculation far faster than classical supercomputers could.',
    fact: 'Many quantum computers must be kept close to absolute zero, colder than outer space, to keep their qubits stable.',
    q: 'What is the basic unit of information in a quantum computer?', a: ['Qubit', 'Byte', 'Pixel'], c: 0,
  },
  biotech: {
    what: 'Biotechnology uses living cells and DNA to develop medicines, vaccines, crops and new materials.',
    real: 'Emmanuelle Charpentier and Jennifer Doudna won the 2020 Nobel Prize in Chemistry for developing CRISPR gene editing.',
    fact: 'mRNA vaccine technology allowed the first COVID-19 vaccines to be developed and approved in less than a year.',
    q: 'What is CRISPR used for?', a: ['Editing genes', 'Encrypting messages', 'Mining cryptocurrency'], c: 0,
  },
  space: {
    what: 'Satellite internet beams connectivity from orbit, reaching ships, planes and remote villages that cables cannot reach.',
    real: 'Geostationary satellites orbit about 35,800 km above the equator, while low Earth orbit constellations fly only a few hundred to about 2,000 km up, which cuts delay.',
    fact: 'Azerbaijan launched its first telecommunications satellite, Azerspace-1, in 2013.',
    q: 'Why do low Earth orbit satellites have lower delay than geostationary ones?', a: ['They are much closer to Earth', 'They use bigger antennas', 'They travel faster than light'], c: 0,
  },
  fusion: {
    what: 'Fusion power aims to produce energy the way the Sun does, by joining light atoms together, without carbon emissions.',
    real: 'In December 2022 the US National Ignition Facility became the first experiment to get more energy out of a fusion reaction than the laser energy put in.',
    fact: 'ITER, a fusion reactor being built in southern France by the EU, China, India, Japan, South Korea, Russia and the US, is one of the largest science projects in the world.',
    q: 'What natural object is powered by nuclear fusion?', a: ['The Sun', 'The Moon', 'Earth\'s oceans'], c: 0,
  },
  agency: {
    what: 'A space agency builds and launches satellites and spacecraft for communication, Earth observation, navigation and science.',
    real: 'The Soviet Union launched Sputnik 1, the first artificial satellite, in 1957.',
    fact: 'Earth observation satellites help countries track crops, floods, wildfires and climate change.',
    q: 'What was the first artificial satellite?', a: ['Sputnik 1', 'Hubble', 'Apollo 11'], c: 0,
  },

  /* ---------- Research: Economy ---------- */
  e1: {
    what: 'Online tax systems let people and companies file and pay taxes in minutes, often with forms the state has already filled in.',
    real: 'In Estonia most people file their income tax return online, and returns are pre-filled with data the tax office already has.',
    fact: 'Pre-filled returns reduce mistakes and save huge amounts of paperwork every year.',
    q: 'What is a pre-filled tax return?', a: ['A return the tax office fills in with data it already has', 'A tax paid years in advance', 'A paper form sent by mail'], c: 0,
  },
  e2: {
    what: 'E-commerce means buying and selling goods and services online.',
    real: 'Amazon started in 1995 as an online bookstore, and Alibaba was founded in China in 1999.',
    fact: 'Online shops let small businesses sell to customers in other countries without opening stores there.',
    q: 'What is e-commerce?', a: ['Buying and selling online', 'Printing electronic money', 'Sending marketing emails'], c: 0,
  },
  e3: {
    what: 'A central bank digital currency (CBDC) is a digital form of a country\'s money, issued by its central bank.',
    real: 'The Bahamas launched the Sand Dollar in 2020, one of the first CBDCs in the world.',
    fact: 'A CBDC differs from cryptocurrencies like Bitcoin because a central bank issues and backs it.',
    q: 'What does CBDC stand for?', a: ['Central Bank Digital Currency', 'Crypto Blockchain Data Chain', 'Certified Bank Deposit Card'], c: 0,
  },
  e4: {
    what: 'Smart contracts are programs stored on a blockchain that carry out an agreement automatically when conditions are met.',
    real: 'Computer scientist Nick Szabo described the idea in the 1990s, and the Ethereum blockchain, launched in 2015, made smart contracts widely used.',
    fact: 'Because the code runs automatically, a bug in a smart contract can be very costly, so independent code audits are common.',
    q: 'Where do smart contracts usually run?', a: ['On a blockchain', 'On a fax machine', 'In a spreadsheet'], c: 0,
  },
  e5: {
    what: 'Open banking lets customers safely share their bank data with other apps through secure interfaces called APIs.',
    real: 'The United Kingdom required its largest banks to support open banking in 2018, alongside the EU\'s PSD2 payment rules.',
    fact: 'Open banking powers budgeting apps that show all of a person\'s bank accounts in one place.',
    q: 'What does API stand for?', a: ['Application Programming Interface', 'Automatic Payment Instruction', 'Advanced Personal ID'], c: 0,
  },
  e6: {
    what: 'Tokenization records ownership of assets such as bonds, property or art as digital tokens that can be traded and divided easily.',
    real: 'Several governments and banks have tested issuing bonds as digital tokens on blockchain platforms.',
    fact: 'Dividing an asset into tokens can let many small investors each own a share of something expensive.',
    q: 'What does tokenization do?', a: ['Represents an asset as digital tokens', 'Turns paper into gold', 'Deletes old records'], c: 0,
  },
  e7: {
    what: 'In a real-time economy, invoices, payments and tax reports flow automatically between computer systems instead of on paper.',
    real: 'Italy made electronic invoicing mandatory for most business-to-business sales in 2019.',
    fact: 'E-invoicing helps tax offices detect fraud faster, because the data arrives as transactions happen.',
    q: 'What replaces paper invoices in a real-time economy?', a: ['Electronic invoices sent between systems', 'Phone calls', 'Handwritten receipts'], c: 0,
  },

  /* ---------- Research: Society ---------- */
  s1: {
    what: 'Electronic health records store a patient\'s history, test results and prescriptions digitally, so doctors can see them when needed.',
    real: 'In Estonia, patients can log in to see their own health records and check which doctors have viewed them.',
    fact: 'Shared records mean a patient does not have to repeat their full medical history at every new clinic.',
    q: 'Why are shared electronic health records useful?', a: ['Doctors can see a patient\'s history quickly', 'They replace all doctors', 'They make medicine free'], c: 0,
  },
  s2: {
    what: 'Online learning uses video lessons, interactive exercises and virtual classrooms to teach people anywhere.',
    real: 'Khan Academy, founded in 2008, offers free lessons used by millions of students around the world.',
    fact: 'Short practice quizzes, like this one, help people remember what they learn. Scientists call this the testing effect.',
    q: 'What is the "testing effect"?', a: ['Practicing recall improves memory', 'Tests make computers faster', 'Testing slows learning down'], c: 0,
  },
  s3: {
    what: 'Electronic signatures let people sign contracts and forms online with legal force.',
    real: 'The EU\'s eIDAS regulation of 2014 says a qualified electronic signature has the same legal effect as a handwritten one.',
    fact: 'Digital signatures use cryptography, so any change to a signed document can be detected.',
    q: 'Under EU eIDAS rules, a qualified e-signature has the same effect as what?', a: ['A handwritten signature', 'A fingerprint scan', 'A spoken promise'], c: 0,
  },
  s4: {
    what: 'Universal connectivity means every person, including people in rural areas, can get affordable internet access.',
    real: 'In 2010 Finland became one of the first countries to make broadband internet access a legal right.',
    fact: 'The gap between people with and without internet access is called the digital divide.',
    q: 'What is the "digital divide"?', a: ['The gap between people with and without internet access', 'A split computer screen', 'A type of firewall'], c: 0,
  },
  s5: {
    what: 'Internet voting lets citizens cast their vote securely online using a digital ID.',
    real: 'Estonia became the first country to allow online voting in nationwide elections, starting with local elections in 2005.',
    fact: 'In Estonia, online voters can change their vote during the voting period, which helps protect them from being pressured.',
    q: 'Which country first allowed online voting in nationwide elections?', a: ['Estonia', 'Brazil', 'Australia'], c: 0,
  },
  s6: {
    what: 'Telemedicine lets patients see doctors by video or chat and share data from devices at home.',
    real: 'Telemedicine use grew sharply during the COVID-19 pandemic in 2020, when many clinics moved appointments online.',
    fact: 'Telemedicine helps people in remote areas reach specialists without traveling long distances.',
    q: 'What is telemedicine?', a: ['Healthcare delivered remotely with technology', 'Medicine advertised on TV', 'A hospital phone book'], c: 0,
  },
  s7: {
    what: 'Digital literacy is the ability to use digital tools safely and well, from writing emails to spotting fake news and scams.',
    real: 'Finland teaches students to recognize misinformation as part of its school curriculum and regularly tops European media literacy rankings.',
    fact: 'Many successful cyber attacks start with a person being tricked, for example by a phishing email.',
    q: 'What is phishing?', a: ['Tricking people into giving away information', 'A fast internet connection', 'A way to cool servers'], c: 0,
  },

  /* ---------- Research: Security ---------- */
  c1: {
    what: 'A firewall checks network traffic and blocks connections that break security rules.',
    real: 'Network firewalls became common in the late 1980s and early 1990s, as companies connected their networks to the internet.',
    fact: 'Firewalls are named after the fire walls in buildings that stop a fire from spreading.',
    q: 'What does a firewall do?', a: ['Filters network traffic using rules', 'Speeds up downloads', 'Cools the computer'], c: 0,
  },
  c2: {
    what: 'Threat intelligence is information about attackers, their tools and methods, shared so defenders can prepare.',
    real: 'MITRE ATT&CK, a free public knowledge base of attacker techniques released in 2015, is used by security teams around the world.',
    fact: 'Many countries run a national CERT (computer emergency response team) that warns organizations about new threats.',
    q: 'What is the main purpose of threat intelligence?', a: ['Learning how attackers work, to prepare defenses', 'Attacking other countries', 'Encrypting hard drives'], c: 0,
  },
  c3: {
    what: 'Public key infrastructure (PKI) uses key pairs and digital certificates so computers can prove who they are and encrypt data.',
    real: 'When you see the padlock in a browser\'s address bar, the website is using a PKI certificate to set up an encrypted HTTPS connection.',
    fact: 'In a key pair, the public key can be shared with anyone, while the private key must stay secret.',
    q: 'Which key in a key pair can be shared with anyone?', a: ['The public key', 'The private key', 'Both keys'], c: 0,
  },
  c4: {
    what: 'Zero trust security assumes that no user or device is trusted by default, even inside the network; every request must be verified.',
    real: 'In 2021 the US government directed federal agencies to move toward zero trust security architectures.',
    fact: 'The motto of zero trust is "never trust, always verify".',
    q: 'What is the motto of zero trust security?', a: ['Never trust, always verify', 'Trust but never check', 'Block everything forever'], c: 0,
  },
  c5: {
    what: 'AI threat detection uses machine learning to spot unusual activity, such as strange logins or traffic, faster than people can.',
    real: 'Security teams receive so many alerts every day that AI tools are used to separate real attacks from false alarms.',
    fact: 'Attackers use AI too, for example to write more convincing phishing messages.',
    q: 'What does AI threat detection look for?', a: ['Unusual activity that may be an attack', 'Spelling errors in documents', 'Low battery warnings'], c: 0,
  },
  c6: {
    what: 'Post-quantum cryptography is encryption designed to stay secure even against future quantum computers.',
    real: 'In August 2024 the US National Institute of Standards and Technology (NIST) published its first post-quantum encryption standards.',
    fact: 'Attackers may "harvest now, decrypt later": steal encrypted data today and decrypt it once quantum computers are powerful enough.',
    q: 'Why do we need post-quantum cryptography?', a: ['Future quantum computers could break today\'s encryption', 'Quantum computers are slow', 'It makes files smaller'], c: 0,
  },
  c7: {
    what: 'Cyber resilience is the ability to keep running and recover quickly after an attack, using backups, drills and response plans.',
    real: 'The widely used 3-2-1 backup rule says: keep three copies of your data, on two kinds of storage, with one copy offsite.',
    fact: 'Ransomware locks data until a ransom is paid; good offline backups let organizations recover without paying.',
    q: 'In the 3-2-1 backup rule, how many copies should be kept offsite?', a: ['One', 'Two', 'Three'], c: 0,
  },

  /* ---------- Research: Infrastructure ---------- */
  i1: {
    what: 'TCP/IP is the set of rules that lets different computers and networks talk to each other. It is the foundation of the internet.',
    real: 'On 1 January 1983 the ARPANET switched to TCP/IP, a date often called the birthday of the internet.',
    fact: 'TCP/IP was designed by Vint Cerf and Bob Kahn in the 1970s.',
    q: 'What is TCP/IP?', a: ['The basic communication rules of the internet', 'A brand of router', 'A programming language'], c: 0,
  },
  i2: {
    what: 'IPv6 is the newer version of the internet\'s addressing system, created because the older IPv4 was running out of addresses.',
    real: 'IPv4 has about 4.3 billion addresses, while IPv6 uses 128-bit addresses, about 3.4 × 10³⁸ of them.',
    fact: 'IPv6 was standardized in the late 1990s, and today a large share of internet traffic, especially on mobile networks, uses it.',
    q: 'Why was IPv6 created?', a: ['IPv4 was running out of addresses', 'To make websites colorful', 'To replace electricity'], c: 0,
  },
  i3: {
    what: 'Virtualization lets one physical server run many separate virtual machines, using hardware far more efficiently.',
    real: 'Virtualization makes cloud computing possible: cloud providers rent out virtual machines instead of whole physical servers.',
    fact: 'IBM ran virtual machines on its mainframe computers as early as the 1960s and 1970s.',
    q: 'What does virtualization let one server do?', a: ['Run many virtual machines', 'Work without power', 'Print documents'], c: 0,
  },
  i4: {
    what: 'An internet exchange point (IXP) is a place where networks connect directly to swap traffic locally.',
    real: 'Countries with local IXPs keep domestic traffic inside the country instead of routing it abroad, which makes it faster and cheaper.',
    fact: 'The largest IXPs, such as those in Frankfurt and Amsterdam, handle traffic of many terabits per second.',
    q: 'What is an internet exchange point?', a: ['A place where networks connect to swap traffic', 'A currency exchange website', 'An online shop'], c: 0,
  },
  i5: {
    what: 'Edge computing processes data close to where it is created, such as in a factory or a cell tower, instead of in a faraway data center.',
    real: 'Self-driving cars and factory robots rely on edge computing because they must react within milliseconds.',
    fact: 'Processing data locally can also protect privacy, because less personal data has to leave the device.',
    q: 'Why use edge computing?', a: ['To process data close to where it is created', 'To store data on paper', 'To slow down networks'], c: 0,
  },
  i6: {
    what: 'A smart grid uses sensors and software to balance electricity supply and demand in real time.',
    real: 'Smart electricity meters, now installed in millions of European homes, let utilities and customers track and reduce consumption.',
    fact: 'Smart grids make it easier to use solar and wind power, whose output changes with the weather.',
    q: 'What does a smart grid balance?', a: ['Electricity supply and demand', 'Bank accounts', 'Only traffic lights'], c: 0,
  },
  i7: {
    what: 'A digital twin is a virtual copy of a real object or system, such as a building, factory or city, kept up to date with live data.',
    real: 'Singapore built "Virtual Singapore", a detailed 3D model of the city, to help plan and test projects.',
    fact: 'Engineers can test changes on a digital twin first, so mistakes cost nothing in the real world.',
    q: 'What is a digital twin?', a: ['A virtual copy of a real system', 'A second phone number', 'Two identical servers'], c: 0,
  },

  /* ---------- Research: Science & AI ---------- */
  a1: {
    what: 'Machine learning lets computers learn patterns from examples instead of following only hand-written rules.',
    real: 'Arthur Samuel popularized the term "machine learning" in 1959 while building a program that learned to play checkers.',
    fact: 'Email spam filters were one of the first machine learning tools used by millions of people every day.',
    q: 'How does machine learning work?', a: ['Computers learn patterns from examples', 'Computers receive programs by mail', 'It only works with photos'], c: 0,
  },
  a2: {
    what: 'Big data means datasets so large and fast-moving that they need special tools to store and analyze.',
    real: 'Big data is often described with the "three Vs": volume, velocity and variety.',
    fact: 'Cities analyze anonymized transport data to plan bus routes and reduce traffic jams.',
    q: 'What are the "three Vs" of big data?', a: ['Volume, velocity, variety', 'Video, voice, vision', 'Value, vote, view'], c: 0,
  },
  a3: {
    what: 'Deep learning uses artificial neural networks with many layers to learn complex patterns in images, sound and text.',
    real: 'In 2012 a deep learning model called AlexNet won the ImageNet image-recognition competition by a wide margin, starting the modern AI boom.',
    fact: 'Artificial neural networks are loosely inspired by how neurons in the brain connect.',
    q: 'What does deep learning use?', a: ['Neural networks with many layers', 'Data centers built deep underground', 'Only hand-written rules'], c: 0,
  },
  a4: {
    what: 'Transformers are a neural network design that processes whole sequences at once using "attention". They power today\'s large language models.',
    real: 'Researchers at Google introduced the transformer in 2017 in a paper titled "Attention Is All You Need".',
    fact: 'The "T" in GPT stands for transformer: Generative Pre-trained Transformer.',
    q: 'What does the "T" in GPT stand for?', a: ['Transformer', 'Technology', 'Translation'], c: 0,
  },
  a5: {
    what: 'Quantum algorithms are step-by-step methods designed to run on quantum computers and take advantage of qubits.',
    real: 'In 1994 Peter Shor showed that a large quantum computer could factor big numbers quickly, which would break widely used RSA encryption.',
    fact: 'Grover\'s algorithm, from 1996, can search an unsorted list much faster than any classical method.',
    q: 'What could Shor\'s algorithm break?', a: ['RSA encryption', 'Wi-Fi signals', 'Solar panels'], c: 0,
  },
  a6: {
    what: 'Neuromorphic chips are processors designed to work like networks of brain neurons, using very little power.',
    real: 'IBM\'s TrueNorth chip, presented in 2014, had about one million artificial neurons.',
    fact: 'The human brain runs on roughly 20 watts, about as much as a dim light bulb, which is why engineers study it to build efficient chips.',
    q: 'What are neuromorphic chips inspired by?', a: ['The human brain', 'Solar cells', 'Car engines'], c: 0,
  },
  a7: {
    what: 'AI alignment is research on making AI systems pursue the goals people intend, safely and honestly.',
    real: 'The United Kingdom and the United States both set up AI safety institutes in 2023 to test advanced AI models.',
    fact: 'AI can find unexpected shortcuts to reach a goal, so goals have to be specified very carefully.',
    q: 'What is AI alignment about?', a: ['Making AI pursue intended goals safely', 'Lining up servers in rows', 'Making AI chips faster'], c: 0,
  },

  /* ---------- Research: Green Tech ---------- */
  n1: {
    what: 'Efficient data centers cut the energy used for cooling and power conversion, so more of it goes to computing.',
    real: 'Efficiency is measured with PUE (power usage effectiveness). A perfect score is 1.0, and the most efficient large data centers reach about 1.1.',
    fact: 'Some data centers reuse their waste heat to warm nearby homes, for example in Finland and Denmark.',
    q: 'What does a PUE of 1.0 mean?', a: ['All energy goes to the computing equipment', 'The data center is switched off', 'It runs only on solar power'], c: 0,
  },
  n2: {
    what: 'Renewable power comes from sources that are naturally replenished, such as sunlight, wind, flowing water and geothermal heat.',
    real: 'Iceland produces almost all of its electricity from hydropower and geothermal energy.',
    fact: 'Solar panel prices fell by around 90 percent during the 2010s, making solar one of the cheapest sources of new electricity.',
    q: 'Which of these is a renewable energy source?', a: ['Wind', 'Coal', 'Natural gas'], c: 0,
  },
  n3: {
    what: 'E-waste recycling recovers valuable materials such as copper, gold and rare metals from old electronics.',
    real: 'The Global E-waste Monitor found the world produced about 62 million tonnes of e-waste in 2022, and less than a quarter was properly collected and recycled.',
    fact: 'A tonne of old phones contains much more gold than a tonne of typical gold ore.',
    q: 'Why recycle old electronics?', a: ['To recover valuable materials and reduce pollution', 'To make phones heavier', 'Because electronics are made of paper'], c: 0,
  },
  n4: {
    what: 'Smart mobility combines public transport, bike sharing, ride sharing and apps to move people efficiently with less pollution.',
    real: 'Tallinn, Estonia\'s capital, has offered free public transport to its registered residents since 2013.',
    fact: 'Mobility-as-a-service apps let travelers plan and pay for buses, trains and scooters in one place.',
    q: 'What is a goal of smart mobility?', a: ['Moving people efficiently with less pollution', 'Only building more parking lots', 'Banning bicycles'], c: 0,
  },
  n5: {
    what: 'Carbon accounting measures how much greenhouse gas an organization or country emits, so it can plan reductions.',
    real: 'The Greenhouse Gas Protocol sorts emissions into Scope 1 (direct), Scope 2 (from purchased energy) and Scope 3 (across the supply chain).',
    fact: 'For many companies, Scope 3 emissions from suppliers and customers are the largest part of their footprint.',
    q: 'What are Scope 2 emissions?', a: ['Emissions from purchased energy', 'Emissions from outer space', 'Emissions from volcanoes'], c: 0,
  },
  n6: {
    what: 'Green hydrogen is made by splitting water with electricity from renewable sources, so producing it emits no carbon.',
    real: 'Hydrogen can replace fossil fuels in heavy industry, such as steelmaking, where batteries are hard to use.',
    fact: 'Splitting water into hydrogen and oxygen with electricity is called electrolysis.',
    q: 'How is green hydrogen made?', a: ['By electrolysis using renewable power', 'By burning coal', 'By freezing water'], c: 0,
  },
  n7: {
    what: 'Energy storage, such as large batteries, saves electricity when it is plentiful and releases it when it is needed.',
    real: 'Lithium-ion battery prices fell by roughly 90 percent between 2010 and 2020, making grid-scale batteries affordable.',
    fact: 'Pumped hydro, which pumps water uphill and lets it flow back down through turbines, is still the largest form of grid energy storage in the world.',
    q: 'What does grid energy storage do?', a: ['Saves electricity until it is needed', 'Produces coal', 'Stores computer data'], c: 0,
  },
};
