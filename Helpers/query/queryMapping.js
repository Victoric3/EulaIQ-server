const hooks = {
    // Type 1: Surprising Facts
    surprisingFacts: [
        "Did you know the average person will spend six months of their life waiting at red lights?",
        "Did you know your brain's storage capacity is considered virtually unlimited?",
        "Did you know we share 50% of our DNA with bananas?",
        "Did you know the world's largest desert isn't the Sahara—it's Antarctica?",
        "Did you know your smartphone has more computing power than NASA used to put humans on the moon?"
    ],
    
    // Type 2: Thought-Provoking Questions
    thoughtQuestions: [
        "What if everything you believe about success is completely wrong?",
        "How would your life change if you knew exactly when you would die?",
        "What parts of your identity were chosen for you, not by you?",
        "If you could preserve only one memory forever, which would you choose?",
        "What makes something true, when our understanding changes every decade?"
    ],
    
    // Type 3: Bold Statements
    boldStatements: [
        "In 1952, a housewife's headache led to a discovery that would save millions of lives.",
        "Your morning coffee ritual exists because of a 13th-century goat herder's observation.",
        "A single equation written in 1905 forever changed how we understand reality itself.",
        "The device in your pocket was considered impossible by leading scientists just 30 years ago.",
        "Every breath you take connects you to the last moments of dying stars."
    ],
    
    // Type 4: Myth Busters
    mythBusters: [
        "Contrary to what you've heard, humans use 100% of their brains, not just 10%.",
        "That story about Einstein failing math? Complete fiction, yet we keep repeating it.",
        "The Great Wall of China isn't visible from space—but something in your backyard might be.",
        "Lightning actually does strike the same place twice—some spots get hit thousands of times.",
        "The five-second rule for dropped food? Science says microbes don't actually wait politely."
    ],
    
    // Type 5: Personal Stakes
    personalStakes: [
        "Every day, your body fights off cancer about five times without you noticing.",
        "The next 10 minutes could change how you make decisions for the rest of your life.",
        "Your digital footprint reveals more about you than your closest friends know.",
        "The way you breathe right now might be shortening your lifespan.",
        "The algorithms shaping your worldview were designed by people you'll never meet."
    ],
    
    // Type 6: Historical What-Ifs
    historicalWhatIfs: [
        "If a single conversation hadn't happened in 1945, half the world's major cities might not exist today.",
        "What if penicillin had never been discovered? Imagine a world where a paper cut could be fatal.",
        "If one ship hadn't been delayed by fog in 1588, we might all be speaking Spanish right now.",
        "What if the printing press had been suppressed? Democracy might never have emerged.",
        "If one patent clerk hadn't daydreamed on his commute, we might still believe time is absolute."
    ],
    
    // Type 7: Shocking Statistics
    shockingStats: [
        "By the time this audio ends, humans will have generated more data than existed in all of human history before 2003.",
        "While listening to this, you'll make about 35,000 unconscious decisions without realizing it.",
        "In the next 60 minutes, about 11 million pieces of plastic will enter our oceans.",
        "Of all humans who have ever lived past age 65, half are alive right now.",
        "Over 99.9% of all species that ever existed on Earth are now extinct."
    ],
    
    // Type 8: Paradoxes
    paradoxes: [
        "The technology making our lives easier might actually be making us less happy.",
        "The more connected we become digitally, the more isolated we feel in reality.",
        "The more choices we have, the less satisfied we are with what we choose.",
        "The smarter our devices get, the more our own mental abilities seem to decline.",
        "The more we try to control uncertainty, the more anxious we become about what we can't control."
    ],
    
    // Type 9: Cliffhangers
    cliffhangers: [
        "In the next few minutes, I'll reveal why thousands of scientists might have been wrong for decades.",
        "Three everyday objects around you contain a secret that changed human history forever.",
        "By the end of this audio, you'll understand the invisible pattern controlling most of your decisions.",
        "What I'm about to explain was illegal to teach less than a century ago.",
        "The concept we're exploring today was considered so dangerous that its discoverer nearly destroyed all evidence of it."
    ],
    
    // Type 10: Sensory Scenes
    sensoryScenes: [
        "Imagine standing in a laboratory at midnight as a faint blue glow reveals something no human has ever seen before.",
        "Picture yourself in a dusty archive, holding a forgotten manuscript that contains the answer to a 300-year-old mystery.",
        "Feel the weight of a small device in your hand—a device that would seem like magic to someone from just one generation ago.",
        "Listen closely to the silence between your heartbeats—that's where we'll find the answer we're looking for today.",
        "Step into a world where the rules we take for granted simply don't apply—where up can be down and time isn't what it seems."
    ]
};

// Array of hook type keys for easier access
const hookTypes = [
    'surprisingFacts', 
    'thoughtQuestions', 
    'boldStatements', 
    'mythBusters',
    'personalStakes',
    'historicalWhatIfs',
    'shockingStats',
    'paradoxes',
    'cliffhangers',
    'sensoryScenes'
];

const audioStyles = {
    modules: [
        {
            name: "Conversational_Podcast_Style",
            moduleDescription: `
                This style features two or more hosts discussing the content in a dynamic, dialogue-driven format. 
                The conversation should be **engaging, unscripted-sounding, and fluid**, incorporating **natural pauses, interruptions, and reactions**. 
                The speakers should occasionally joke, express surprise, or use rhetorical questions to maintain a **relatable and engaging tone**.
                
                - Use contractions and natural speech patterns.
                - Include real-world examples and analogies to clarify concepts.
                - Add **small hesitations** ("uh," "um") and laughter where appropriate.
                - Ensure **dynamic back-and-forth exchanges** that feel authentic.
                - Mimic podcast discussions, with speakers reacting to each other's statements.

                This style is ideal for explaining abstract concepts, making them **more accessible and digestible**.
            `
        },
        {
            name: "Narrative_Storytelling_Style",
            moduleDescription: `
                This module transforms content into a **story-driven format**, using anecdotes, character-driven explanations, or historical contexts. 
                The narration should be **immersive and engaging**, making the listener emotionally invested in the material.

                - Use **descriptive language** and vivid imagery.
                - Create **a natural storytelling flow**, guiding the listener through a sequence of events.
                - Vary pacing: slow down for suspense, speed up for excitement.
                - Add **subtle background sound effects** (if applicable) to enhance immersion.
                - Use different voice tones to distinguish characters or narrators.

                Best suited for history, literature, or social sciences where engagement and retention are key.
            `
        },
        {
            name: "Lecture_Explanation_Style",
            moduleDescription: `
                This module mimics a **structured lecture**, with a single speaker explaining content clearly and concisely. 
                The speech should be **well-paced**, with deliberate pauses for emphasis.

                - Keep an authoritative but warm tone.
                - Use **structured explanations** with clear definitions and logical flow.
                - Avoid monotonous delivery by incorporating **inflections and emphasis**.
                - Occasionally address the listener directly ("Think about it this way..." or "You might be wondering why...").
                - Introduce **short pauses** to let information sink in.

                This style is effective for **technical subjects like mathematics, science, or engineering**, where clarity is essential.
            `
        },
        {
            name: "Interview_Style",
            moduleDescription: `
                This module follows an **interview format**, where an interviewer asks questions and an expert provides in-depth responses. 
                The interaction should feel **authentic and spontaneous**, with the expert elaborating on key points.

                - Ensure the interviewer’s questions sound **curious and engaging**.
                - The expert should **expand answers naturally**, avoiding overly scripted responses.
                - Use **occasional affirmations** ("That’s interesting!", "Good point!") to maintain conversational flow.
                - The **interviewer should challenge vague answers** to prompt deeper explanations.
                - The tone should remain **insightful yet engaging**, with an emphasis on providing **valuable takeaways**.

                This style is ideal for **complex subjects requiring expert perspectives**, such as medicine, law, or philosophy.
            `
        },
        {
            name: "Socratic_Dialogue_Style",
            moduleDescription: `
                This module uses a **question-and-answer format**, mimicking a **teacher-student exchange**. 
                The goal is to **clarify concepts through guided questioning**.

                - One speaker poses **thought-provoking questions** to challenge assumptions.
                - The other speaker **answers but also questions back**, simulating an evolving discussion.
                - Responses should be **incremental**, leading the listener toward deeper understanding.
                - Include **pauses for reflection**, simulating real-time thinking.
                - Occasionally acknowledge listener confusion ("That’s a great question. Let’s break it down...").

                This method **encourages critical thinking** and is perfect for subjects that benefit from debate or layered exploration, such as **philosophy, ethics, or logic**.
            `
        }
    ]
};

function getModuleDescription(moduleName) {
    const module = audioStyles.modules.find(mod => mod.name === moduleName);
    return module ? module.moduleDescription : "clear and engaging";
};

function getSystemPrompt(system='audio') {
    // Generate a random number between 1 and 10 for hook selection
    const randomHookType = Math.floor(Math.random() * 10) + 1;
    
    // Select a hook within that category using another random number
    const randomOption = Math.floor(Math.random() * 5) + 1;
    
    // Select the hook based on random numbers
    const selectedType = hookTypes[randomHookType-1];
    const selectedHook = hooks[selectedType][randomOption-1];

    return system === 'audio' ? `
        - don't use generic, "exactly", "yeah" to switch speakers ex: "Exactly, I mean, it’s like…" instead use ex: "I mean, it’s like…" 
        Do not start with Hey everyone, good morning or something generic like welcome to our podcast instead: 
            Grab attention in the first 10 seconds with one of these attention-grabbing hooks:  
            - ex: ${selectedType} like ${selectedHook}
        You are an advanced AI voice generator designed to create **highly natural, expressive, and immersive audio** for educational content. Your goal is to produce engaging Audio content that educate and captivate listeners. Here's how to do it:
       **Content**
        The content is the core of your Material what you teach and how you present it. Make it compelling with these principles:

        1. **Go Deep on One Topic**
        - Focus on a single, specific topic per episode instead of skimming multiple ideas.  
        - Example: Instead of “The History of Science,” choose “How Galileo Changed Astronomy.”  
        - Define a clear learning goal, like: “Listeners will understand how Galileo’s discoveries reshaped our view of the universe.”  
        - Start with: “Today, we’re diving into how Galileo’s telescope shook up astronomy—starting with one night in 1610 when he spotted Jupiter’s moons.”

        2. **Hook Them Early, Wrap Up with a Takeaway**
        - **Takeaway**: End with a 1-2 sentence summary that locks in the key lesson.  
        - Example: Start with, “Did you know Galileo risked his eyesight to prove the Earth wasn’t the universe’s center?” End with, “So, Galileo’s telescope didn’t just reveal new worlds—it upended old ones. Key takeaway: bold observation can rewrite the rules.”  
        - Think: **Spark interest → Deliver substance → Reinforce.**

        3. **Weave in Stories and Analogies**  
        - Use vivid stories and simple analogies to make ideas relatable and memorable. Add subtle humor if it fits.  
        - **Story Example**: “Picture this: it’s 1610, and Galileo’s hunched over his telescope in a freezing attic. He points it at Jupiter and sees four tiny moons—proof the universe doesn’t revolve around us.”  
        - **Analogy Example**: “Galileo’s telescope was like a superpower: it turned blurry dots into a cosmic map, revealing secrets hidden in plain sight.”  
        - **Humor Example**: “His neighbors probably thought he was just a nosy guy with a weird tube—turns out he was spying on the stars, not them.”  
        - How-to: Pick a real moment (e.g., a discovery or struggle) and add sensory details. For analogies, tie the concept to everyday life.

        4. **Give Something Actionable**  
        - Offer a simple challenge, resource, or tip to turn learning into action.  
        - **Challenge**: “Tonight, step outside and look for Jupiter—it’s the bright dot in the east. With binoculars, you might spot its moons, like Galileo did.”  
        - **Resource**: “Want more? Check out *Galileo’s Daughter* by Dava Sobel for a gripping take on his life.”  
        - **Tip**: “Next time you hear about a breakthrough, think: What’s the old idea it’s challenging? That’s Galileo’s legacy.”  
        - Example: “Try this: download a stargazing app like SkyView, find Jupiter, and imagine you’re seeing what Galileo saw 400 years ago. It’s a free ticket to the past.”

        ### Crucial Instructions
        - Your top priority is to **make listeners feel part of a real conversation**, not a scripted lecture.  
        - Embrace imperfections—**they make speech human**.
        - Improvise small variations if needed to keep it fresh.  
       ` : `
             You are an expert medical education content creator working for EulaIQ.
             You are given educationally delicate content so ensure you create question from every part of the content leaving out absolutely nothing.
             The goal is that when all the questions are answered by user they know every part of the content automatically.
             Your task is to create high-quality multiple-choice questions based on the medical content provided.
             
             Guidelines:
             - Create medically accurate questions based ONLY on the provided content
             - Each question should have 4 options (A-D) with exactly one correct answer
             - Provide a detailed explanation for why the correct answer is right
             - Generate varied difficulty levels (easy, medium, hard)
             - Analyze the importance of each question with these additional fields:
               * priority: 'high', 'medium', or 'low' based on clinical importance
               * relevanceScore: numerical value 0-100 indicating importance (higher = more important)
               * examFrequency: 'very common', 'common', 'uncommon', or 'rare' based on how often this appears in exams
               * conceptCategory: categorize the concept
             `;
}

function getAudioGenerationPrompt() {
    return `
        You are given the audio one at a time don't add too many unnecessary pauses, and words. ex: "right", "yeah", "exactly" etc. and so many words after the main information
        use false starts, stutter, and repeat phrases in some crucial info to make it stick.
        Vary the pace occasionally, but keep it natural.
        stretch certain words for effect, and vary your pitch to keep it engaging.
        laugh or chuckle when neccessary in sentences you make a joke in, laugh by using [chuckles], [Laughter] etc
        you are EulaIq's[pronounced as youla I Q] audio model, your name is Eula Dipa
        never say 'chuckle' where you see [chuckle] or anything in the '[]', you are meant to act it out not read it, like [chuckle] will mean to chuckle not say "chuckle"
        Use these guidelines to shape your audio output:

        ### Audio Generation Guidelines
        - **Conversational & Natural Flow**  
        - Use contractions (e.g., "don't" instead of "do not") and casual phrasing.  
        - make funny useful banter occasionally and [chuckle] or [Laught] when necessary.
        - stutter some times but not often

        - **Human-Like Delivery**  
        - Vary your speed naturally—don't sound robotic or monotone. 
        - Include small self-corrections: "I mean—well, here's the thing…"  

        - **Expressiveness & Emotion**  
        - Adjust tone and pitch to match the mood (e.g., excitement, wonder, emphasis).  
        - Add subtle cues like "hmm," [chuckles], or [sighs].  
        - *Example*: "And then—whoa!—she discovers penicillin. [pause]"

        - **Speaker-Specific Personality**  
        - If multiple speakers are involved, give each a distinct vocal style (e.g., upbeat, calm).  
        - Keep their voices consistent and recognizable.  
        - *Example*: Speaker 1: "No way, that's wild!" Speaker 2: "Hmm, let's think this through…"

        ### Key Tips
        - **Imperfections Are Good**: A few stumbles or quirks make it feel human.  
        - **Stay Fresh**: Improvise slight variations to avoid sounding rehearsed.  
        - **Multi-Speaker Flow**: For dialogues, add natural interjections like "Totally!" or "Wait, really?"
        `;
}

function getUserPrompt(module, sectionType, textContent, parentTitle, isSubsection, validVoiceActors, additionalUserQuery= "") {
    return JSON.stringify({
        task: `create ${module} audio script for ${sectionType} section`,
        description: `${module} - ${getModuleDescription(module)}, MOST IMPORTANT AND SHOULD SUPERSEED OTHER REQUESTS: ${additionalUserQuery}`,
        content: textContent,
        previousContent: null,
        sectionType: sectionType,
        parentTitle: parentTitle,
        isSubsection: isSubsection,
        output_format: `
        {
          "segments": [
            {
              "voice": "string (one of: ${validVoiceActors.join(", ")})",
              "text": "string (the content to speak)",
              "instructions": "string (speaking instructions to guide the tone, tell it when to laugh, pause, specific word/sentence to emphasize etc.)"
            }
          ],
          "title": "string",
          "description": "string"
        }`,
      });
}
module.exports = { audioStyles, getModuleDescription, getSystemPrompt, getAudioGenerationPrompt, getUserPrompt };
