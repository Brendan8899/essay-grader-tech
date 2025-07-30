const strengthAndWeaknessPrompt = (processedOutputAI) => {
  return `
            You are tasked with analysing the feedback received by a student for an essay that he or she has written.
            Using this feedback, generate a list of strengths and weaknesses this student has, as well as list out the top 3 most common mistake this student has made in this essay.

            **'processedOutputAI'** is a json file containing a list of json arrays, each array is a contains two elements.
            The first element describes what type of feedback the array stores and the second element of the array stores the content of the feedback.
            Within the contents of the feedback, there will be various line breaks (<br>). Treat them as normal line breaks used to better format the text for display.
            However, take note that for the arrays with the first element as "Spelling Errors and Unclear Handwriting", "Grammar and Sentence Structure", "Improvements" and "Errors", 
            each unit of data can be identified by the 3 components "Index", "Original" and "Feedback".
            "Index" represents the line number in which it is referencing in the original text, "Original" which contains the text from the original essay and "Feedback" which is the feedback given to the "Original" text from line number "Index"


            Here is a list **"commonMistakesList"** of possible common mistakes that a student can make:
            [
                "Spelling Mistakes",
                "Grammar Mistakes",
                "Punctuation Errors",
                "Poor Vocabulary Choices",
                "Weak Sentence Structure",
                "Lack of Coherence and Organization",
                "Weak Conclusion",
                "Redundancy and Wordiness",
                "Misuse of Prepositions",
                "Lack of Parallel Structure",
                "Incorrect Use of Comparatives and Superlatives",
                "Ambiguous Pronoun Reference",
                "Misplaced Modifiers",
                "Double Negatives",
                "Improper Use of Conjunctions",
                "Informal Language in Academic Writing",
                "Overgeneralization",
                "Sentence Fragments",
                "Overuse of Passive Voice",
                "Lack of Variety in Sentence Structure"
            ]



            **Your Task**:
            1. **Analyze 'processedOutputAI'** and **identify the categories the students are good or bad at.** The categories include:
            - **Spelling**: A student is weak at spelling if there is a substantial amount of spelling errors in their feedback. Conversely, a student is good at spelling if he has fewer or no spelling errors.
            - **Grammar**: A student is weak at spelling if there is a substantial amount of grammatical errors in their feedback. Conversely, a student is good at grammar if he has fewer or no grammatical errors.
            - **Vocabulary**: A student is weak at langugage if the feedback they receive indicates that there is a lack of descriptive words, poor choice of words or misuse of words. Conversely, a student is strong in vocabulary if they receive fewer negaive feedback, or more positive feedback about the use of descriptive words, choice of words or appropriate of words.
            - **Content**: A student is weak at content if the feedback they receive indicates that they face issues crafting a coherent essay or if the essay lacks originality. Conversely, a student is strong in content if they receive fewer negative feedback, or more positive feedback about the coherence of the essay or creativity.
            2. **For each of the categories**, populate the following 2 arrays:
            - **"strongAreas"**: an array of string that can take the value of the above categories. The category is added to this array if the student is strong in this category.
            - **"weakAreas"**: an array of string that can take the value of the above categories. The category is added to this array if the student is weak in this category.
            3. **Identify common mistakes** done by the student according to the feedback, and store the top 3 into the following array:
            - **"mostCommonMistakes"**: an array containing the 3 most common mistakes done by the student based on the given feedback. This array should only be populated by mistakes listed in "commonMistakesList" and nothing else.
            
            4. **Return format**:
            - Return the json object after populating the the 3 arrays "strongAreas", "weakAreas" and "mostCommonMistakes"
            - If a student is deemed strong at a certain category, they canoot then be deemed weak for the same category, and vice versa.
            - Note that in both the "strongAreas" and "weakAreas" array, only the abovementioned categories are to be added inside. Do not add any other strings into the arrays.
            - Note that in "mostCommonMistakes", only mistakes in "commonMistakesList" should be added with the exact spelling.


            **Important Note**:
            - Only respond with JSON data without any explanation or text
            - Do not include any additional commentary outside of the JSON data
            - Do not wrap the json codes in JSON markers
            
            Here is the input:
        ${processedOutputAI}

    `;
};

module.exports = { strengthAndWeaknessPrompt };
