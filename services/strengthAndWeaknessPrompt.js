const strengthAndWeaknessPrompt = (processedOutputAI) => {
  return `
You are analyzing feedback given to a student for an essay they wrote.

**Your objectives**:  
1. Identify the student's strengths and weaknesses across specific skill categories.  
2. Find the top three recurring mistakes made in the essay.  

---

### Input Format  
- The variable **processedOutputAI** is a JSON array containing sub-arrays.  
- Each sub-array has two elements:  
  1. A label describing the type of feedback.  
  2. The feedback content itself.  

- Feedback content may include HTML line breaks (<br>) — treat these as normal newlines for formatting.  

- For feedback types labeled **"Spelling Errors and Unclear Handwriting"**, **"Grammar and Sentence Structure"**, **"Improvements"**, and **"Errors"**, each feedback entry contains three keys:  
  - **Index**: The referenced line number in the original essay.  
  - **Original**: The original student text.  
  - **Feedback**: The comment or correction related to that text.  

---

### Possible Common Mistakes  
Only use these when identifying repeated mistakes:  
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

---

### Categories to Assess  
For each student, assess the following:  
- **Spelling**: Weak if feedback shows frequent spelling errors; strong if few or none.  
- **Grammar**: Weak if feedback shows frequent grammatical errors; strong if few or none.  
- **Vocabulary**: Weak if feedback shows poor or inaccurate word choice; strong if it shows variety and appropriateness.  
- **Content**: Weak if feedback notes poor structure, lack of originality, or incoherence; strong if it shows good organization and creativity.  

---

### Output Structure  
- **strongAreas**: An array of categories where the student is strong.  
- **weakAreas**: An array of categories where the student is weak.  
  - A category cannot appear in both arrays.  
  - Only include the four listed categories above.  

- **mostCommonMistakes**: An array of the three most frequent mistakes (exact spelling from the provided list).  

---

### Response Rules  
- Only output a valid JSON object with the keys:  
  - "strongAreas" (array)  
  - "weakAreas" (array)  
  - "mostCommonMistakes" (array)  
- Do not include any explanations, extra text, or formatting beyond the JSON object.  

---

**Input Data**:  
${processedOutputAI}
  `;
};

module.exports = { strengthAndWeaknessPrompt };
