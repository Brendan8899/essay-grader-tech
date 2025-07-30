/**
 * Generates a markdown-formatted feedback string to be appended to a document.
 *
 * @param {string[]} feedbackOptions - The feedback types to include in the output document.
 * @param {Object} data - The metadata of the document to process.
 * @param {boolean} includeFeedbackErr - Whether to include feedback errors (e.g., side errors) in the output.
 * @returns {string} The feedback markdown string to be appended to the document.
 */
function generateFeedback(feedbackOptions, data, includeFeedbackErr) {
  const { processedOutputAI, pointSystem, annotations, userAnnotations } = data;
  const annotationTypes = {
    "Spelling Errors": "spelling_and_handwriting",
    "Grammar Errors": "grammar",
    Improvements: "improvement",
    Punctuation: "punctuation",
  };

  let feedbackOutput = generateScoreSection(processedOutputAI, pointSystem, feedbackOptions);
  feedbackOutput += generateAiSection(processedOutputAI, feedbackOptions);
  feedbackOutput += generateAnnotations(
    annotationTypes,
    annotations,
    userAnnotations,
    feedbackOptions,
    includeFeedbackErr
  );

  return feedbackOutput;
}

function generateAnnotations(
  annotationTypes,
  annotations,
  userAnnotations,
  feedbackOptions,
  includeFeedbackErr
) {
  let output = "";
  Object.entries(annotationTypes).forEach(([label, type]) => {
    if (!includeFeedbackErr) {
      const feedback = Object.values(annotations)
        .flat()
        .filter((item) => item.error_type === type)
        .map((item) => {
          return `- Index: ${item.index}\n- Feedback: "${item.feedback || "No feedback provided"}"\n\n`;
        });
      output += `### ${label}\n${feedback.join("").trim()}\n`;
    }
    if (
      feedbackOptions.includes(label) &&
      Array.isArray(userAnnotations) &&
      userAnnotations.some((item) => item.errorType === type)
    ) {
      output += `## Additional ${label}\n`;

      userAnnotations
        .filter((item) => item.errorType === type)
        .forEach((item) => {
          output += `- Index: ${item.index}\n- Feedback: "${item.feedback || "No feedback provided"}"\n\n`;
        });
    }
  });
  return output;
}

function generateScoreSection(processedOutputAI, pointSystem, feedbackOptions) {
  const maxPoint = parseInt(pointSystem.slice(0, 2));
  const scoreEntries = {
    "Total Score": filterAIOutput(processedOutputAI, "Total Score")[1],
    "Language Score": filterAIOutput(processedOutputAI, "Language Score")[1],
    "Content Score": filterAIOutput(processedOutputAI, "Content Score")[1],
  };

  let output = "# General Feedback\n";
  if (feedbackOptions.includes("Total Score")) {
    output += `- Total Score: ${scoreEntries["Total Score"]}/${maxPoint}\n`;
  }
  if (feedbackOptions.includes("Score Breakdown")) {
    output += `- Language Score: ${scoreEntries["Language Score"]}/${maxPoint / 2}\n`;
    output += `- Content Score: ${scoreEntries["Content Score"]}/${maxPoint / 2}\n`;
  }

  return output;
}

function generateAiSection(processedOutputAI, feedbackOptions) {
  let output = "";
  const aiSections = [
    { key: "Summary", heading: "## Summary" },
    { key: "Feedback", heading: "## Feedback" },
    { key: "Strength", heading: "## Strength" },
    { key: "Weakness", heading: "## Weakness" },
  ];
  aiSections.forEach(({ key, heading }) => {
    if (feedbackOptions.includes(key)) {
      const content = filterAIOutput(processedOutputAI, key)[1]?.trim();
      if (content) {
        output += `${heading}\n${content}\n`;
      }
    }
  });
  return output;
}

const filterAIOutput = (outputArr, key) => {
  const result = outputArr.find((prop) => prop[0] === key);
  if (!result) return [key, ""];

  return result;
};

module.exports = {
  generateFeedback,
};
