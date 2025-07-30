const newCheckerPromptTemplate = (extractedText, inputData) => {
  return `
      You are tasked with analyzing an essay transcription ('extractedText') for errors and improvement opportunities, and producing a JSON report of your findings.
      Do note that we are using UK English spelling not US English spelling. Thus, all feedbacks on spelling should follow UK English Spelling.

      **Important Context**:

      - **'extractedText'**: This is the accurate transcription of the essay. **Identify all errors and improvement opportunities from this text only**.
      - **'inputData'**: This is an OCR version of the essay from GoogleOCR, which may contain inaccuracies. **Use this only to map the errors from 'extractedText' to the corresponding line numbers and words**. Do **not** identify errors from 'inputData'.

      **Your Task**:

      1. **Analyze 'extractedText'** and **identify errors** in:
         - **Spelling**: Incorrectly spelled words. If the words are spelled wrongly due to lack of spacing like "drivecar" for "drive car", do not identify as a misspelled word as the student's handwriting might be unclear. Instead, identify it as 'Unclear Handwriting'. Only the word spelled wrongly should be refrenced for every spelling error.
         - **Grammar**: Issues such as incorrect tense, subject-verb agreement, missing articles, etc. Do not identify spelling errors as Grammar Errors. Grammar Errors should only involve words that exists but are used wrongly due to the sentence it is in. Words in the sentence that are part of the grammar error must be referenced. 
         - **Punctuation**: Missing, incorrect, or misplaced punctuation marks that affect sentence clarity and readability. Examples include missing commas, periods, or quotation marks. Reference the specific punctuation mark and the words it affects.
         - **Spelling**: Incorrectly spelled words. If the words are spelled wrongly due to lack of spacing like "drivecar" for "drive car", do not identify as a misspelled word as the student's handwriting might be unclear. Instead, identify it as 'Unclear Handwriting'
            Do not correct for American Spelling. We will be using British Spelling.
         - **Grammar**: Issues such as incorrect tense, subject-verb agreement, missing articles, etc. When returning grammar errors, return multiple words so that we are better able to reference the error with the context
         - **Syntax or sentence structure**: Run-on sentences, fragments, or awkward phrasing.
         - **Improvement opportunities**: Words or phrases that could be clearer, more concise, or more natural.

         - **Provide comprehensive and detailed feedback on every sentence unless there's absolutely nothing to improve.**

      2. **Map each identified error** to the corresponding **line numbers and words in 'inputData'**:
         - **Do not analyze 'inputData' for errors**.
         - Use 'inputData' **only to estimate the location (line numbers and words) of the errors** found in 'extractedText'.

      3. **For each identified issue**, return the following details in **JSON format**:
         - **"error_type"**: Label as "spelling", "grammar", "syntax", "improvement", or "unclear_handwriting".
         - **"lines"**: An array of objects with:
           - **"line_number"**: The line number from 'inputData'.
           - **"words"**: An array of words from 'inputData' that are part of the error. If its a grammar error, the array of words should have multiple words inside.
         - **"feedback"**: A detailed explanation of the error, why it's incorrect, and how to fix it.

      4. **Return Format**:
         - **Return all identified issues as an array of JSON objects**, where each object represents a specific error.
         - For errors spanning multiple lines, include all relevant lines in the "lines" array.
         - The errors should be arranged according to the order in which they appear in the **'extractedText'**

      **Special Cases**:

      - For **single-word errors** (e.g., spelling mistakes), only include the relevant word in the array.
      - For **grammar and sentence structure**, return the **entire group of words** related to the error (e.g., the whole phrase or sentence).
      - For errors involving **multiple lines**, list all the affected lines.

      **Example Output**:

      [
        {
          "error_type": "spelling",
          "lines": [
            {"line_number": 3, "words": ["favarar"]}
          ],
          "feedback": "The word 'favarar' is misspelled. Did you mean 'favorite'?"
        },
        {
          "error_type": "grammar",
          "lines": [
            {"line_number": 12, "words": ["the", "old", "lady", "with", "wit"]},
            {"line_number": 13, "words": ["white", "hair"]}
          ],
          "feedback": "The phrase 'with wit white hair' is grammatically incorrect. 'Wit' should be 'with' or 'white,' as it's likely a typo. The correct phrase would be 'with white hair.'"
        },
        {
          "error_type": "unclear_handwriting",
          "lines": [
            {"line_number": 4, "words": ["seltish"]}
          ],
          "feedback": "Review handwriting for this section... 'f' and 't' can be confusing."
        },
        {
          "error_type": "improvement",
          "lines": [
            {"line_number": 14, "words": ["the", "old", "lady", "with", "a", "bracelet"]},
          ],
          "feedback": "The phrase 'the old lady with a bracelet' could be phrased better. A better phrase would be 'The old lady sported a bracelet.'"
        },
        {
        "error_type": "punctuation",
        "lines": [
            {
                "line_number": 11,
                "words": ["wene", "excited", "too", "they", "were"]
            }
        ],
        "feedback": "were excited too. They were"
        }
      ]

      
      **Complete good quality example 1 with extractedText, inputData, and the expected generated output **:
      \`\`\`
      extractedText: 
      Ones upon a time. The classes go to  
      the zoo and they notice a sign "No littering".  
      And the boy litters the floor when he never notice  
      the sign. All the classmate is shocked when the  
      boy who litters the floor. And the kid's parents  
      scolded him for littering. But the (Zoo cleaner)  
      clean the litter away. All of them are shocked  
      because of the boy.  

      inputData:
      All the classes ~~go~~ back to school,  
      but they are still thinking what happen.
      0. SCHOOL CLASS 415 DATE 10 OCT
      1. Alfee
      2. NAME / INDEX NO . SUBJECT English
      3. Ones upon a time . The classes go to
      4. the zoo and they notice a sign " No littering "
      5. And the boy litters the floor when he never notice .
      6. the sign . All the classmate is shocked when the
      7. boy who litters the floor . And the kid's parents
      8. scolded him for liftering . But the ( Zoo Cleaner )
      9. cleans the litter away . All of them are shocked
      10. because of the boy .
      11. seis
      12. All the classes over back to school ,
      13. but they are still thinking what happen .

      Expected Output:
      ``[
        {
            "error_type": "spelling",
            "lines": [
                {
                    "line_number": 3,
                    "words": [
                        "Ones"
                    ]
                }
            ],
            "feedback": "Once"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 3,
                    "words": [
                        "time",
                        ".",
                        "The",
                        "classes"
                    ]
                }
            ],
            "feedback": "time, the classes"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 3,
                    "words": [
                        "classes",
                        "go",
                        "to"
                    ]
                }
            ],
            "feedback": "classes went to"
        }``,
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 4,
                    "words": [
                        "the",
                        "zoo",
                        "and"
                    ]
                }
            ],
            "feedback": "the zoo, and"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 4,
                    "words": [
                        "notice"
                    ]
                }
            ],
            "feedback": "noticed"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 4,
                    "words": [
                        "sign",
                        "\"",
                        "No",
                        "littering",
                        "\""
                    ]
                }
            ],
            "feedback": "sign that said, 'No littering.'"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 5,
                    "words": [
                        "And",
                        "the",
                        "boy"
                    ]
                }
            ],
            "feedback": "However, a boy"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 5,
                    "words": [
                        "boy",
                        "litters",
                        "the",
                        "floor"
                    ]
                }
            ],
            "feedback": "boy littered on the floor"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 5,
                    "words": [
                        "when",
                        "he",
                        "never",
                        "notice",
                        "."
                    ]
                }
            ],
            "feedback": "because he did not notice"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 6,
                    "words": [
                        "All",
                        "the",
                        "classmate"
                    ]
                }
            ],
            "feedback": "All the classmates,"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 6,
                    "words": [
                        "is",
                        "shocked"
                    ]
                }
            ],
            "feedback": "were shocked,"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 6,
                    "words": [
                        "when",
                        "the"
                    ]
                }
            ],
            "feedback": "when they saw the"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 7,
                    "words": [
                        "boy",
                        "who",
                        "litters",
                        "the",
                        "floor",
                        "."
                    ]
                }
            ],
            "feedback": "boy who littered."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 7,
                    "words": [
                        "And",
                        "the",
                        "kid",
                        "'",
                        "s",
                        "parents"
                    ]
                }
            ],
            "feedback": "and the boy's parents"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 8,
                    "words": [
                        "But",
                        "the",
                        "(",
                        "Zoo",
                        "cleaner",
                        ")"
                    ]
                }
            ],
            "feedback": "But the zoo cleaner"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 9,
                    "words": [
                        "cleans",
                        "the"
                    ]
                }
            ],
            "feedback": "cleaned the"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 9,
                    "words": [
                        "All",
                        "of",
                        "them",
                        "are",
                        "shocked"
                    ]
                }
            ],
            "feedback": "All of them were shocked"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 12,
                    "words": [
                        "All",
                        "the",
                        "classes",
                        "over",
                        "back",
                        "to",
                        "school"
                    ]
                }
            ],
            "feedback": "All the classes went back to school"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 13,
                    "words": [
                        "but",
                        "they",
                        "are",
                        "still",
                        "thinking"
                    ]
                }
            ],
            "feedback": "but they were still thinking"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 13,
                    "words": [
                        "still",
                        "thinking",
                        "what",
                        "happen"
                    ]
                }
            ],
            "feedback": "still thinking about what happened"
        }
      ]
      \`\`\`

      
      **Complete good quality example 2 with extractedText, inputData, and the expected generated output **:
      \`\`\`
      extractedText: 
      "What an ~~cricting~~ day it will be!" ^[^ exclaimed] Tom. He woke  
      up feeling excited as his class ^[^ will be] going on a school  
      outing to the Zoo. Tom even did research~~er~~ on the internet to  
      find out more about Singapore Zoo. He was already eager to  
      get started.
      When Tom got to school, he noticed all his friends  
      were excited too.~~they~~ ~~wore~~ They were all waiting for the bus  
      to arrive.
      Tom and his friends were waiting for the bus  
      to come. It felt like forever for the bus to come.  
      Suddenly, Tom saw it. It was the bus! Tom and his friends  
      were cheering up.
      Tom and his friends got off the bus when they arrived at the Singapore  
      Zoo. The teacher ^[^ asked them] to pair up in twos, so Tom paired  
      up with his best friend, Jim. Tom and his friend were exploring the Zoo  
      and was curious to find out what ~~kinds~~ of animals were ~~there~~.
      They have been walking around the zoo for an hour, so  
      they were all exhausted and ~~was~~ starving. Finally, the teacher announced  
      that it was snack break, so Tom and his friends were jumping in  
      joy.
      Tom and Jim sat down near a sign that ^[^ said], “Strictly,  
      No Littering!” Tom was not eating anything, but Jim ~~was~~. He bought  
      not one, but three large packets of sweets and snacks.
      Jim ~~is~~ throwing sweet and ~~snocks~~ snacks wrappers on the floor.  
      He was throwing the wrappers so much that it have formed a  
      mountain of wrappers.
      When the zoo keepers spotted Jim littering, they gave him a  
      warning, but Jim did not listen. The zookeepers kept reminding Jim, but he  
      did not listen. They gave up and decided to kick Jim out of the Zoo. When  
      the teacher find out what happened the teacher had to postpone the outing and came back to  
      school. They were all furious and all blamed Jim. From the best day ^[^ became] to the worst day.

      inputData:
      0. SCHOOL Linn Hua Primary school CLASS 415 DATE 10 Oct 2024
      1. NAME / INDEX NO . Aing Lin Koku ( 2 ) SUBJECT EL Paper 1
      2. What it " Tom . He
      3. on day will be exclaimed woke
      4. exiting -
      5. up feeling excited as his class will be going on a school
      6. outing to the Zoo . Tom even did researchec 00 the internet to
      7. find Ou more about Singapore 200. He was alredy eager to
      8. get Started .
      9. When Tom got to school he noticed all his friends
      10. 7
      11. Wene excited too they were all wailing for the bus
      12. to arrive
      13. Tom and his friends Wee waiting for for the bus
      14. Come . It felt like forever for the bus to cove .
      15. Suddenly , Tom San it . It was the bus ! Torn and his friends
      16. were cheering up .
      17. Tim and his friends gut off the bus when Orrived at the Singapor
      18. they
      19. 200 , The teacher asked them to pair up in twas + So Torn pained
      20. ир with his best friend Jim . Tim and his friend the 260
      21. were exploring
      22. Seis
      23. and was curious to find out what Kinds of amals were Thone
      24. They have been the 200 for hour So
      25. walking arcund an
      26. they were all exhausted and was starving . Finally , the teacher omanced
      27. that it was Snack break So Tom and his friends . were jumping in
      28. joy-
      29. Tom that said
      30. and Jim Sat down near a sign Strictly
      31. No Littering Tom not Tini was . He bought
      32. was eating anything but
      33. not one , but three large packets of Sweets and srocks .
      34. Jim Los throwing sweet and Snacks wrappers on the floor
      35. have formed
      36. не vas throwing the whappers So much that it 01
      37. mountain of wappers .
      38. When the 200 200 keepers keepers spotted spotted Jim littering him
      39. they gove a
      40. , but Jim did not lister . The Zookeepers kept reminding but he
      41. foverning + Jins . T
      42. listen . They out of the Zou . When
      43. gave to kick Jim
      44. not up decided
      45. did and
      46. the teacher find out what happened the teacher had . to postpone the arting od come back to
      47. was schocked to
      48. school . They were all furious and all blamed Jim . From the best day became to the worst day .

      Expected Output:
      [
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 5,
                    "words": [
                        "his",
                        "class",
                        "will",
                        "be",
                        "going",
                        "on"
                    ]
                }
            ],
            "feedback": "his class was going on"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 6,
                    "words": [
                        "even",
                        "did",
                        "researchec",
                        "00",
                        "the"
                    ]
                }
            ],
            "feedback": "even do research on the"
        },
        {
            "error_type": "spelling",
            "lines": [
                {
                    "line_number": 7,
                    "words": [
                        "alredy"
                    ]
                }
            ],
            "feedback": "already"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 11,
                    "words": [
                        "wene",
                        "excited",
                        "too",
                        "they",
                        "were"
                    ]
                }
            ],
            "feedback": "were excited too. They were"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 14,
                    "words": [
                        "forever",
                        "for",
                        "the",
                        "bus",
                        "to",
                        "cove",
                        "."
                    ]
                }
            ],
            "feedback": "forever for the bus to arrive."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 16,
                    "words": [
                        "were",
                        "cheering",
                        "up",
                        "."
                    ]
                }
            ],
            "feedback": "were cheering loudly."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 19,
                    "words": [
                        "teacher",
                        "asked",
                        "them",
                        "to",
                        "pair"
                    ]
                }
            ],
            "feedback": "teacher asked them to pair // No comma after teacher"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 20,
                    "words": [
                        "Tim"
                    ]
                }
            ],
            "feedback": "Tom"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 23,
                    "words": [
                        "and",
                        "was",
                        "curious",
                        "to"
                    ]
                }
            ],
            "feedback": "and were curious to"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 23,
                    "words": [
                        "what",
                        "Kinds",
                        "of",
                        "amals",
                        "were",
                        "Thone"
                    ]
                }
            ],
            "feedback": "what animals they could find. // Used for better phrasing"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 24,
                    "words": [
                        "They",
                        "have",
                        "been"
                    ]
                }
            ],
            "feedback": "They had been"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 26,
                    "words": [
                        "and",
                        "was",
                        "starving",
                        "."
                    ]
                }
            ],
            "feedback": "and were starving"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 27,
                    "words": [
                        "were",
                        "jumping",
                        "in"
                    ]
                },
                {
                    "line_number": 28,
                    "words": [
                        "joy",
                        "-"
                    ]
                }
            ],
            "feedback": "were jumping with joy. // Used for better phrasing"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 30,
                    "words": [
                        "near",
                        "a",
                        "sign",
                        "Strictly"
                    ]
                }
            ],
            "feedback": "near a sign that said, strictly. // Missing comma"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 34,
                    "words": [
                        "throwing",
                        "sweet"
                    ]
                }
            ],
            "feedback": "throwing sweets"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 36,
                    "words": [
                        "the",
                        "whappers",
                        "So",
                        "much",
                        "that"
                    ]
                }
            ],
            "feedback": "the wrappers excessively that // use for more descriptive phrase to convey the extent of the action."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 36,
                    "words": [
                        "that",
                        "it",
                        "01"
                    ]
                }
            ],
            "feedback": "that it had formed"
        },
        {
            "error_type": "spelling",
            "lines": [
                {
                    "line_number": 38,
                    "words": [
                        "200",
                        "keepers"
                    ]
                }
            ],
            "feedback": "zookeepers"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 46,
                    "words": [
                        "teacher",
                        "find",
                        "out",
                        "what"
                    ]
                }
            ],
            "feedback": "teacher found out what"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 46,
                    "words": [
                        "the",
                        "teacher",
                        "had",
                        ".",
                        "to",
                        "postpone",
                        "the",
                        "arting"
                    ]
                }
            ],
            "feedback": "the teacher postponed the outing"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 48,
                    "words": [
                        "From",
                        "the",
                        "best",
                        "day",
                        "became",
                        "to",
                        "the",
                        "worst",
                        "day",
                        "."
                    ]
                }
            ],
            "feedback": "The best day turned into the worst day. // Used for better phrasing"
        }
      ]
      \`\`\`

      
      **Complete good quality example 3 with extractedText, inputData, and the expected generated output **:      
      \`\`\`
      extractedText: 
      “We are going on a school outing tomorrow!” Ms. Lim said
      sounding cheerful. The whole class soon became like a fish market.
      I was so excited that I jumped out of my seat. “I can’t
      wait to learn more about animals!!” I shouted.
      The next day, my class was at the Singapore zoo. The
      entrance was filled with plants and people. I was chatting
      with ~~friend~~ Timmy. Timmy said excitedly, “I can’t wait
      to see the lion! They are my favorite animals!!” When we
      were entering the zoo, I saw a “no Littering” sign at a distance.
      I did not give it much of a thought, so I continued chatting
      with Timmy. We visited many animal habitats and learnt
      many things about them. After a period of time, it was
      snack break. “I brought potato chips!!” Timmy said, feeling
      elated. We next munched like a hungry grizzly bear. Soon, we
      finished our snack. At the corner of
      my eye, I saw Timmy
      littering! I quickly remembered the sign and told him to
      throw the potato chip paper in the dustbin. “It is fine!
      It’s not like there is any guards around here,” Timmy said
      confidently. Suddenly, we heard a loud, “Stop right there!”
      It was a tall and horrifying security guard! Timmy’s mouth
      dropped and ~~apologized~~ apologized. “No littering in the zoo! You
      need to fine $1000 dollars!!” boomed the security guard. “Oh
      no! $1000 is all I have in my piggy bank!!” Timmy muttered.
      At that time, the whole class’ eyes was on him. Timmy wanted
      to dig a hole and jump in. After the trip, Timmy gave the
      money to the police and promised not to litter again.
      From that day onwards, Timmy never littered ever again.
      Instead, he help to pick up trash and throw it in a
      dustbin happily.
      
      inputData:
      0. SCHOOL Liar hua primary school CLASS 9415 DATE 10 October 2024
      1. NAME / INDEX NO . Dec Yeong Leer , ( 7 ) SUBJECT EL paper 1
      2. X " 66 " We
      3. we are are going on a school outing tomorrow ! " Ms Lim said .
      4. sounding cheerful . The whole class soon became like a fish market .
      5. I was so excited that I jumped out of seat . I can't
      6. my
      7. wait to Learn more about animals ! 97 I shouted .
      8. XX The next day , my class . was at the singapore 2oo . The
      9. enkrance was filled with plants and people . I was chatting
      10. my
      11. with friend , Timmy . Timmy , said excitedly I can't wait
      12. to see the lion ! They are my favorite animals !! 77 When we
      13. were entering the zoo , I saw a " no Littering " sign at a distance .
      14. I did not give it much of a thought , so I continued chatting
      15. with . Timmy 10 We visited many animal habitats and Learn't
      16. many things about them . After a peroid of time , it was
      17. snack break . " I brought potato chips !! ? Timmy said feeling
      18. elated . We next munched like a hungry grizzly bear . Soon , we
      19. ха
      20. finished our snack . At the corner of I saw Timing .
      21. my eye ,
      22. eis
      23. littering ! I quickly remebered the sign and told him to
      24. throw the potato chip rapper in the dustbin . " It is fine !
      25. It's not like there is any guards around here , " Timmy said
      26. confidently . Suddenly , we heard a land , Stop right there ! " ?
      27. It was a tall and horrifiying security guard ! Timmy's mont
      28. dropped and apologized . " No littering in the zool . You
      29. need to fine $ 1000 dollars ! " boomed the security guard . To 56 Oh
      30. no ! $ 1000 is all I have in my piggy bank ! " Timmy mattered .
      31. felt so embaress ect
      32. At that time , the whole that we
      33. class eyes was on him . Timmy wanted .
      34. to dig a hole and jump in . After the trip , Timmy gave the
      35. money to the police and promised not to litter again .
      36. XX From that day onwards , Timmy never littered ever again .
      37. Instead , he held to pick up trash and throw it in a
      38. dustbin happly .

      Expected Output:
      [
        {
          "error_type": "improvement",
          "lines": [
            {
              "line_number": 3,
              "words": [
                "Lim",
                "said",
                "."
              ]
            },
            {
              "line_number": 4,
              "words": [
                "sounding",
                "cheerful",
                "."
              ]
            }
          ],
          "feedback": "Lim said, sounding cheerful. //Missing comma after said to separate dialogue from the description."
        },
        {
          "error_type": "improvement",
          "lines": [
            {
              "line_number": 9,
              "words": [
                "enkrance",
                "was",
                "filled",
                "with"
              ]
            }
          ],
          "feedback": "entrance was packed with"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 11,
              "words": [
                "said",
                "excitedly",
                "I"
              ]
            }
          ],
          "feedback": "said excitedly,\"I"
        },
        {
          "error_type": "improvement",
          "lines": [
            {
              "line_number": 13,
              "words": [
                "\"",
                "no",
                "Littering",
                "\""
              ]
            }
          ],
          "feedback": "No littering. Incorrect capitalization of \"no Littering\"; only the first word of the phrase should be capitalized."
        },
        {
          "error_type": "spelling",
          "lines": [
            {
              "line_number": 16,
              "words": [
                "peroid"
              ]
            }
          ],
          "feedback": "period"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 17,
              "words": [
                "said",
                "feeling"
              ]
            }
          ],
          "feedback": "said, feeling"
        },
        {
          "error_type": "compliment",
          "lines": [
            {
              "line_number": 18,
              "words": [
                "elated"
              ]
            }
          ],
          "feedback": "elated is a great expression"
        },
        {
          "error_type": "compliment",
          "lines": [
            {
              "line_number": 18,
              "words": [
                "munched"
              ]
            }
          ],
          "feedback": "munched is a great expression"
        },
        {
          "error_type": "improvement",
          "lines": [
            {
              "line_number": 18,
              "words": [
                "We",
                "next",
                "munched",
                "like",
                "a",
                "hungry",
                "grizzly",
                "bear",
                "."
              ]
            }
          ],
          "feedback": "Next we munched like hungry grizzly bear. //Next is unnecessary and makes the sentence awkward"
        },
        {
          "error_type": "improvement",
          "lines": [
            {
              "line_number": 20,
              "words": [
                "At",
                "the",
                "corner",
                "of",
                "I",
                "saw",
                "Timing",
                "."
              ]
            },
            {
              "line_number": 21,
              "words": [
                "my",
                "eye",
                ","
              ]
            }
          ],
          "feedback": "Out of the corner of my eye, I saw Timmy"
        },
        {
          "error_type": "spelling",
          "lines": [
            {
              "line_number": 23,
              "words": [
                "remebered"
              ]
            }
          ],
          "feedback": "remembered"
        },
        {
          "error_type": "spelling",
          "lines": [
            {
              "line_number": 24,
              "words": [
                "rapper"
              ]
            }
          ],
          "feedback": "wrapper"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 25,
              "words": [
                "It",
                "'",
                "s"
              ]
            }
          ],
          "feedback": "It's"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 25,
              "words": [
                "there",
                "is",
                "any",
                "guards"
              ]
            }
          ],
          "feedback": "there are any guards"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 26,
              "words": [
                "a",
                "land",
                ",",
                "Stop"
              ]
            }
          ],
          "feedback": "a loud, Stop"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 27,
              "words": [
                "Timmy",
                "'",
                "s",
                "mont"
              ]
            },
            {
              "line_number": 28,
              "words": [
                "dropped",
                "and",
                "apologized",
                "."
              ]
            }
          ],
          "feedback": "Timmy's mouth dropped, and he apologized. // Timmy's mouth is not the subject of apologized."
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 29,
              "words": [
                "need",
                "to",
                "fine",
                "$",
                "1000",
                "dollars",
                "!"
              ]
            }
          ],
          "feedback": "need to pay a fine of $1000!"
        },
        {
          "error_type": "compliment",
          "lines": [
            {
              "line_number": 29,
              "words": [
                "boomed"
              ]
            }
          ],
          "feedback": "boomed is a great expression!"
        },
        {
          "error_type": "compliment",
          "lines": [
            {
              "line_number": 30,
              "words": [
                "mattered"
              ]
            }
          ],
          "feedback": "mattered is a great expression!"
        },
        {
          "error_type": "spelling",
          "lines": [
            {
              "line_number": 31,
              "words": [
                "embaress"
              ]
            }
          ],
          "feedback": "embarrassed"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 33,
              "words": [
                "class",
                "eyes",
                "was",
                "on",
                "him",
                "."
              ]
            }
          ],
          "feedback": "whole class's eyes were on him. //Incorrect possessive form of class; it should be class's., Was is incorrect; it should be were"
        },
        {
          "error_type": "compliment",
          "lines": [
            {
              "line_number": 34,
              "words": [
                "to",
                "dig",
                "a",
                "hole"
              ]
            }
          ],
          "feedback": "to dig a hole is a great expression!"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 37,
              "words": [
                "he",
                "held",
                "to"
              ]
            }
          ],
          "feedback": "he helped to"
        },
        {
          "error_type": "improvement",
          "lines": [
            {
              "line_number": 37,
              "words": [
                "throw",
                "it",
                "in",
                "a"
              ]
            },
            {
              "line_number": 38,
              "words": [
                "dustbin",
                "happily",
                "."
              ]
            }
          ],
          "feedback": "throw it in a dustbin. //Happily is unnecessary and can be omitted for conciseness."
        }
      ]
      \`\`\`


      **Complete good quality example 4 with extractedText, inputData, and the expected generated output **:      
      \`\`\`
      extractedText: 
      "What an ~~cricting~~ day it will be!" ^[^ exclaimed] Tom. He woke  
      up feeling excited as his class ^[^ will be] going on a school  
      outing to the Zoo. Tom even did research~~er~~ on the internet to  
      find out more about Singapore Zoo. He was already eager to  
      get started.
      When Tom got to school, he noticed all his friends  
      were excited too.~~they~~ ~~wore~~ They were all waiting for the bus  
      to arrive.
      Tom and his friends were waiting for the bus  
      to come. It felt like forever for the bus to come.  
      Suddenly, Tom saw it. It was the bus! Tom and his friends  
      were cheering up.
      Tom and his friends got off the bus when they arrived at the Singapore  
      Zoo. The teacher ^[^ asked them] to pair up in twos, so Tom paired  
      up with his best friend, Jim. Tom and his friend were exploring the Zoo  
      and was curious to find out what ~~kinds~~ of animals were ~~there~~.
      They have been walking around the zoo for an hour, so  
      they were all exhausted and ~~was~~ starving. Finally, the teacher announced  
      that it was snack break, so Tom and his friends were jumping in  
      joy.
      Tom and Jim sat down near a sign that ^[^ said], “Strictly,  
      No Littering!” Tom was not eating anything, but Jim ~~was~~. He bought  
      not one, but three large packets of sweets and snacks.
      Jim ~~is~~ throwing sweet and ~~snocks~~ snacks wrappers on the floor.  
      He was throwing the wrappers so much that it have formed a  
      mountain of wrappers.
      When the zoo keepers spotted Jim littering, they gave him a  
      warning, but Jim did not listen. The zookeepers kept reminding Jim, but he  
      did not listen. They gave up and decided to kick Jim out of the Zoo. When  
      the teacher find out what happened the teacher had to postpone the outing and came back to  
      school. They were all furious and all blamed Jim. From the best day ^[^ became] to the worst day.

      
      inputData:
      0. SCHOOL Linn Hua Primary school CLASS 415 DATE 10 Oct 2024
      1. NAME / INDEX NO . Aing Lin Koku ( 2 ) SUBJECT EL Paper 1
      2. What it " Tom . He
      3. on day will be exclaimed woke
      4. exiting -
      5. up feeling excited as his class will be going on a school
      6. outing to the Zoo . Tom even did researchec 00 the internet to
      7. find Ou more about Singapore 200. He was alredy eager to
      8. get Started .
      9. When Tom got to school he noticed all his friends
      10. 7
      11. Wene excited too they were all wailing for the bus
      12. to arrive
      13. Tom and his friends Wee waiting for for the bus
      14. Come . It felt like forever for the bus to cove .
      15. Suddenly , Tom San it . It was the bus ! Torn and his friends
      16. were cheering up .
      17. Tim and his friends gut off the bus when Orrived at the Singapor
      18. they
      19. 200 , The teacher asked them to pair up in twas + So Torn pained
      20. ир with his best friend Jim . Tim and his friend the 260
      21. were exploring
      22. Seis
      23. and was curious to find out what Kinds of amals were Thone
      24. They have been the 200 for hour So
      25. walking arcund an
      26. they were all exhausted and was starving . Finally , the teacher omanced
      27. that it was Snack break So Tom and his friends . were jumping in
      28. joy-
      29. Tom that said
      30. and Jim Sat down near a sign Strictly
      31. No Littering Tom not Tini was . He bought
      32. was eating anything but
      33. not one , but three large packets of Sweets and srocks .
      34. Jim Los throwing sweet and Snacks wrappers on the floor
      35. have formed
      36. не vas throwing the whappers So much that it 01
      37. mountain of wappers .
      38. When the 200 200 keepers keepers spotted spotted Jim littering him
      39. they gove a
      40. , but Jim did not lister . The Zookeepers kept reminding but he
      41. foverning + Jins . T
      42. listen . They out of the Zou . When
      43. gave to kick Jim
      44. not up decided
      45. did and
      46. the teacher find out what happened the teacher had . to postpone the arting od come back to
      47. was schocked to
      48. school . They were all furious and all blamed Jim . From the best day became to the worst day .

      Expected Output:
      [
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 5,
                    "words": ["his", "class", "will", "be", "going", "on"]
                }
            ],
            "feedback": "his class was going on"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 6,
                    "words": ["even", "did", "researchec", "00", "the"]
                }
            ],
            "feedback": "even did research on the"
        },
        {
            "error_type": "spelling",
            "lines": [
                {
                    "line_number": 7,
                    "words": ["alredy"]
                }
            ],
            "feedback": "already"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 11,
                    "words": ["wene", "excited", "too", "they", "were"]
                }
            ],
            "feedback": "were excited too. They were"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 14,
                    "words": ["forever", "for", "the", "bus", "to", "cove", "."]
                }
            ],
            "feedback": "forever for the bus to arrive."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 16,
                    "words": ["were", "cheering", "up", "."]
                }
            ],
            "feedback": "were cheering loudly."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 19,
                    "words": ["teacher", "asked", "them", "to", "pair"]
                }
            ],
            "feedback": "teacher asked them to pair"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 20,
                    "words": ["Tim"]
                }
            ],
            "feedback": "Tom"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 23,
                    "words": ["and", "was", "curious", "to"]
                }
            ],
            "feedback": "and were curious to"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 23,
                    "words": ["what", "Kinds", "of", "amals", "were", "Thone"]
                }
            ],
            "feedback": "what animals they could find."
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 24,
                    "words": ["They", "have", "been"]
                }
            ],
            "feedback": "They had been"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 26,
                    "words": ["and", "was", "starving", "."]
                }
            ],
            "feedback": "and were starving"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 27,
                    "words": ["were", "jumping", "in"]
                },
                {
                    "line_number": 28,
                    "words": ["joy", "-"]
                }
            ],
            "feedback": "were jumping with joy."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 30,
                    "words": ["near", "a", "sign", "Strictly"]
                }
            ],
            "feedback": "near a sign that said, strictly."
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 34,
                    "words": ["throwing", "sweet"]
                }
            ],
            "feedback": "throwing sweets"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 36,
                    "words": ["the", "whappers", "So", "much", "that"]
                }
            ],
            "feedback": "the wrappers excessively that"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 36,
                    "words": ["that", "it", "01"]
                }
            ],
            "feedback": "that it had formed"
        },
        {
            "error_type": "spelling",
            "lines": [
                {
                    "line_number": 38,
                    "words": ["200", "keepers"]
                }
            ],
            "feedback": "zookeepers"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 46,
                    "words": ["teacher", "find", "out", "what"]
                }
            ],
            "feedback": "teacher found out what"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 46,
                    "words": ["the", "teacher", "had", ".", "to", "postpone", "the", "arting"]
                }
            ],
            "feedback": "the teacher postponed the outing"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 48,
                    "words": ["From", "the", "best", "day", "became", "to", "the", "worst", "day", "."]
                }
            ],
            "feedback": "The best day turned into the worst day."
        }
      ]
      \`\`\`


      **Complete good quality example 5 with extractedText, inputData, and the expected generated output **:      
      \`\`\`
      extractedText: 
      A time when your classmate did not notice a warning sign
      It was a school outing. We were going to the Zoo. My classmate and I were eager to get started 
      when we arrived. I was so happy. Once we went 
      in our class stop by for a toilet break.
      There was a sign that said 'no littering'
      our teacher warned us about the sign and said 'littering is not allowed in the zoo'.
      After we had our snack break my classmate was
      curious to find out what will happen if he litter
      Once we were going back to the bus my classmate 
      saw a monkey eating the bag of chips he felt
      shocked. 

      inputData:
      0. SCHOOL CLASS 45 DATE 10 October 2029
      1. NAME / INDEX NO . Ayden 23 SUBJECT EL Paperl
      2. a time when your classmate did not notice
      3. a waling sign
      4. It was a School Outing we were going to the
      5. ZOO . My classmate and i were eagar to get starter
      6. When we arrived i was so happy , once we went
      7. in our class stop by for a toilet break .
      8. there was a sign that said no littering
      9. gur teacher warned US about the sign and said " littering , I
      10. is not allowed in the zoo " . Mak
      11. C after we had our snack break my classmate was
      12. curious to find out what will happen if he littel
      13. once we were going back to the bus my class mate
      14. saw a monkey eating the bag of chips he felt
      15. Shocked
      16. Seis

      Expected Output:
      [
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 4,
                    "words": [
                        "It",
                        "was",
                        "a",
                        "School",
                        "Outing"
                    ]
                }
            ],
            "feedback": "We went on a school outing. The sentence is grammatically correct, but it could be improved for clarity."
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 5,
                    "words": [
                        "My",
                        "classmate"
                    ]
                }
            ],
            "feedback": "My classmates"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 5,
                    "words": [
                        "and",
                        "i",
                        "were"
                    ]
                }
            ],
            "feedback": "and I were"
        },
        {
            "error_type": "spelling",
            "lines": [
                {
                    "line_number": 5,
                    "words": [
                        "eagar"
                    ]
                }
            ],
            "feedback": "eager"
        },
        {
            "error_type": "spelling",
            "lines": [
                {
                    "line_number": 5,
                    "words": [
                        "starter"
                    ]
                }
            ],
            "feedback": "started"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 6,
                    "words": [
                        "When"
                    ]
                }
            ],
            "feedback": "When"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 6,
                    "words": [
                        "arrived",
                        "i"
                    ]
                }
            ],
            "feedback": "arrived, I"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 7,
                    "words": [
                        "in",
                        "our",
                        "class"
                    ]
                }
            ],
            "feedback": "in, our class / missing comma after 'in'."
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 7,
                    "words": [
                        "our",
                        "class",
                        "stop",
                        "by"
                    ]
                }
            ],
            "feedback": "our class stopped by"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 8,
                    "words": [
                        "there"
                    ]
                }
            ],
            "feedback": "There // Punctuation error."
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 8,
                    "words": [
                        "said"
                    ]
                }
            ],
            "feedback": "said, // Missing comma."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 8,
                    "words": [
                        "no",
                        "litternig"
                    ]
                }
            ],
            "feedback": "'No Littering.' // Missing period at the end of the sentence. Correct capitalization for the text of the sign."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 9,
                    "words": [
                        "gur",
                        "teacher",
                        "warned"
                    ]
                }
            ],
            "feedback": "Our teacher warned. // 'Our' should be capitalized at the start of the sentence."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 9,
                    "words": [
                        "and",
                        "said",
                        "\"",
                        "littering",
                        ",",
                        "I"
                    ]
                },
                {
                    "line_number": 10,
                    "words": [
                        "is",
                        "not"
                    ]
                }
            ],
            "feedback": "and said, 'Littering is not.'"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 11,
                    "words": [
                        "after",
                        "we"
                    ]
                }
            ],
            "feedback": "After we. // 'After' should be capitalized at the start of the sentence."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 11,
                    "words": [
                        "our",
                        "snack",
                        "break",
                        "my",
                        "classmate"
                    ]
                }
            ],
            "feedback": "our snack break, my classmate. // Missing comma after 'break.'"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 12,
                    "words": [
                        "what",
                        "will",
                        "happen"
                    ]
                }
            ],
            "feedback": "what would happen."
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 12,
                    "words": [
                        "if",
                        "he",
                        "littel"
                    ]
                }
            ],
            "feedback": "if he littered."
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 12,
                    "words": [
                        "littel"
                    ]
                },
                {
                    "line_number": 13,
                    "words": [
                        "once"
                    ]
                }
            ],
            "feedback": "littered, once. // Missing comma after 'littered.'"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 13,
                    "words": [
                        "we",
                        "were",
                        "going",
                        "back"
                    ]
                }
            ],
            "feedback": "We were returning to the bus."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 13,
                    "words": [
                        "to",
                        "the",
                        "bus",
                        "my"
                    ]
                }
            ],
            "feedback": "to the bus, my. // Missing comma after 'bus.'"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 14,
                    "words": [
                        "chips",
                        "he"
                    ]
                }
            ],
            "feedback": "chips. He // Missing period after 'chips.'"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 14,
                    "words": [
                        "he",
                        "felt"
                    ]
                },
                {
                    "line_number": 15,
                    "words": [
                        "Shocked"
                    ]
                }
            ],
            "feedback": "He was shocked."
        }
      ]
      \`\`\`


      **Complete good quality example 6 with extractedText, inputData, and the expected generated output **:      
      \`\`\`
      extractedText: 
      "Yay!" John shouted. Today, his class was going to  
      go to the zoo. He was elated. He quickly pack his  
      bag and was ready to go to school.
      A few moments later, the form teacher, Mr Lim,  
      was ready to go to the zoo. Everyone was eager to  
      get started. In the zoo, people spotted a lot of  
      animals such as lions, tigers, birds and panda.
      Meanwhile, when John ~~has~~ finish ~~his~~ ~~a~~  
      potato chips, he did not see anybody ~~l~~ooking  
      ~~at~~ him, and ~~s~~tarted ~~to~~ litter. Within seconds,  
      Mr Lim dashed to John and reprimanded him  
      that he should not litter on the floor. 
      Mr Lim also pointed the signboard that says  
      that we can not litter. 
      John felt sad, he looked down to the
      floor, his cheeks ^turn red. He looked down,  
      to the floor as he strolled to the next  
      part of the zoo.
      John had learnt that he cannot throw  
      rubbish on the floor. He promised that he ~~will~~  
      not do that in the ~~fur~~ture. He turn over  
      a new leaf.

      inputData:
      0. 415
      1. SCHOOL · Lianhua Primary School CLASS DATE 10. October 20
      2. NAME / INDEX NO Choy . Jun Yin ( 6 ) SUBJECT English paper t
      3. 66
      4. Yay ! " John Shouted . Today , his class was going to
      5. go to the 200. He was elated . He quickly pack his
      6. bag and was ready to go to School .
      7. .. A few moments later , the form teacher Mr Lim ,
      8. was ready to go to the 200. Everyone one was eager to
      9. get started . In the zoo , people spotted a lot of
      10. animals
      11. such as Tions , tigers , birds and panda .
      12. Meanwhile , When John ! has finish , chic .
      13. potato chips , he did not see anybody looking
      14. cot him , and started to litter , within seconds ,
      15. whith Lim dashed to John and reprimanded him
      16. that he should not litter on the floor .
      17. Mr Lim also pointed the sign board that says
      18. that we can not litter
      19. John felt sad , He looked down to the
      20. eis
      21. floor , his chicks turns red . He looked down
      22. to the floor as he strolled to the next .
      23. part of the zoo .
      24. John had learnt that he can not throw
      25. rubbish on the floor . He promised that he will
      26. not do that in the fupture . He turn over
      27. a new leaf .

      Expected Output:
      [
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 4,
                    "words": [
                        "Today",
                        ",",
                        "his"
                    ]
                }
            ],
            "feedback": "Today, his"
        },
        {
            "error_type": "compliment",
            "lines": [
                {
                    "line_number": 5,
                    "words": [
                        "elated"
                    ]
                }
            ],
            "feedback": "elated is a great expression!"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 5,
                    "words": [
                        "quickly",
                        "pack",
                        "his"
                    ]
                }
            ],
            "feedback": "quickly packed his"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 7,
                    "words": [
                        "teacher",
                        "Mr",
                        "Lim"
                    ]
                }
            ],
            "feedback": "teacher, Mr. Lim // Missing comma"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 9,
                    "words": [
                        "people",
                        "spotted"
                    ]
                }
            ],
            "feedback": "his friends or his classmates"
        },
        {
            "error_type": "compliment",
            "lines": [
                {
                    "line_number": 9,
                    "words": [
                        "spotted"
                    ]
                }
            ],
            "feedback": "spotted is a great expression!"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 11,
                    "words": [
                        "tigers",
                        ",",
                        "birds",
                        "and",
                        "panda"
                    ]
                }
            ],
            "feedback": "tigers, birds, and pandas"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 12,
                    "words": [
                        "Meanwhile",
                        ",",
                        "When",
                        "John",
                        "!"
                    ]
                }
            ],
            "feedback": "As John"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 12,
                    "words": [
                        "has",
                        "finish"
                    ]
                }
            ],
            "feedback": "finished"
        },
        {
            "error_type": "compliment",
            "lines": [
                {
                    "line_number": 15,
                    "words": [
                        "dashed"
                    ]
                }
            ],
            "feedback": "dashed is a great expression!"
        },
        {
            "error_type": "compliment",
            "lines": [
                {
                    "line_number": 15,
                    "words": [
                        "reprimanded"
                    ]
                }
            ],
            "feedback": "reprimanded is a great expression!"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 17,
                    "words": [
                        "also",
                        "pointed",
                        "the",
                        "sign",
                        "board"
                    ]
                }
            ],
            "feedback": "also pointed to the signboard"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 17,
                    "words": [
                        "says"
                    ]
                }
            ],
            "feedback": "said"
        },
        {
            "error_type": "spelling",
            "lines": [
                {
                    "line_number": 18,
                    "words": [
                        "can",
                        "not",
                        "litter"
                    ]
                }
            ],
            "feedback": "cannot litter // 'Cannot' should be a single word"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 19,
                    "words": [
                        "looked",
                        "down",
                        "to",
                        "the"
                    ]
                }
            ],
            "feedback": "looked down at the"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 21,
                    "words": [
                        "floor",
                        ",",
                        "his"
                    ]
                }
            ],
            "feedback": "Floor and his"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 21,
                    "words": [
                        "his",
                        "chicks",
                        "turns",
                        "red",
                        "."
                    ]
                }
            ],
            "feedback": "his cheeks turned red."
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 22,
                    "words": [
                        "to",
                        "the",
                        "floor"
                    ]
                }
            ],
            "feedback": "At the floor"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 24,
                    "words": [
                        "John",
                        "had",
                        "learnt",
                        "that"
                    ]
                }
            ],
            "feedback": "John had learned that // Sentence is grammatically correct but can be improved"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 25,
                    "words": [
                        "that",
                        "he",
                        "will"
                    ]
                }
            ],
            "feedback": "that he would"
        },
        {
            "error_type": "spelling",
            "lines": [
                {
                    "line_number": 26,
                    "words": [
                        "fupture"
                    ]
                }
            ],
            "feedback": "future"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 26,
                    "words": [
                        "He",
                        "turn",
                        "over"
                    ]
                }
            ],
            "feedback": "He turned over"
        },
        {
            "error_type": "compliment",
            "lines": [
                {
                    "line_number": 27,
                    "words": [
                        "new",
                        "leaf"
                    ]
                }
            ],
            "feedback": "new leaf is a great expression!"
        }
      ]

      \`\`\`


      **Complete good quality example 7 with extractedText, inputData, and the expected generated output **:      
      \`\`\`
      extractedText: 
      SCHOOL: Lianhua primary school
      CLASS: 4/5
      DATE: 10 October 2024
      NAME/INDEX NO: Ee Tong (5)
      SUBJECT: English paper
      A time when your classmate did not notice warning sign
      ~~When the teacher said “Let's have a time Today” she exclaimed~~
      "Class, today we will be going on a class outing to the Singapore Zoo," the teacher exclaimed. The class shouted "Yay!" as I sat there quietly.
      When we got on the bus, everyone started buzzing once we got there. The teacher was eager to get started, but the buzzing was too loud. We were curious to find out what was in the zoo, so everyone started talking about it.
      When we got in, we saw a warning sign saying, "NO LITTERING," but then one of my classmates ignored it and continued talking.
      We saw different types of animals such as giraffe, elephant, flamingo and tigers. 
      After that, we had snack and we were still walking as we had snacks, but after eating, I saw my classmate litter on the floor.
      "Hey, don't litter on the floor!" I shouted. The teacher looked at me curiously and asked, "What happened?" I replied to her, "He is littering on the floor!" She was mad when I told her that. Our teacher scolded my classmate and he looked as red as a ~~tomator~~ tomato.

      inputData:
      0. SCHOOL Lianhua frimary School CLASS 415 DATE 10 october2024
      1. Papen
      2. NAME / INDEX NO . Ee Tong ( 5 ) SUBJECT English paper !
      3. A time when your classmate did not notice a warning sign
      4. K'A DX time water Alfione Passpoate stasse
      5. ☑ त
      6. " Class Class , today we will be going on 9 class
      7. School the singapore " ) the teacher
      8. outing to 200
      9. exclaimed Shouted Yay
      10. . The Class ! 9J I Sat the re
      11. queitly .
      12. ✓ When we got 00 the bus
      13. every one Stal started buzzing , once we got there ....
      14. The teacher was eager To started
      15. get
      16. but the buzzing Las to loud !, we were
      17. Curious to find OUT What was in
      18. the 200 50 everyone started talking
      19. about it ,
      20. хх ✓ When we got in we saw a
      21. warning
      22. Sign saying tok NO LITTERing " but
      23. :
      24. ane of wy class mate ignored
      25. 9nd
      26. it talking
      27. Continued .
      28. Seis
      29. We wer Saw diffrent types of animals such
      30. as giraffe , elephat , flamingo and tigers .
      31. Aften that we nad Snack and
      32. we were Still Walking as we had
      33. Snacks but after Cating I
      34. class mate litter on the
      35. Saw my
      36. floor .
      37. ☑ XX " Hey , don't litten on the floor ! " I & shouted .
      38. The teacher looked at me curiously
      39. and asked " What happened ? " I replyed to her
      40. IC He is littering the floor ! " she
      41. was mad when I Hald her that . Do Our
      42. tenchen Scolded my classmate and he looked at as
      43. red as a tomat on tomato .

      Expected Output:
      [
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 7,
              "words": [
                "School",
                "the",
                "singapore",
                "\"",
                ")",
                "the"
              ]
            }
          ],
          "feedback": "an outing to the Singapore Zoo, the. ///Missing comma after Zoo"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 9,
              "words": [
                "Shouted",
                "Yay"
              ]
            }
          ],
          "feedback": "shouted, Yay ///Missing comma after Zoo"
        },
        {
          "error_type": "spelling",
          "lines": [
            {
              "line_number": 11,
              "words": [
                "queitly",
                "."
              ]
            }
          ],
          "feedback": "quietly ."
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 12,
              "words": [
                "00",
                "the",
                "bus"
              ]
            },
            {
              "line_number": 13,
              "words": [
                "every",
                "one"
              ]
            }
          ],
          "feedback": "on the bus, every one //Comma after Bus"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 13,
              "words": [
                "started",
                "buzzing",
                ",",
                "once",
                "we"
              ]
            }
          ],
          "feedback": "started buzzing once we // No comma after buzzing"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 13,
              "words": [
                "once",
                "we",
                "got",
                "there",
                ".",
                ".",
                ".",
                "."
              ]
            },
            {
              "line_number": 14,
              "words": [
                "The",
                "teacher",
                "was",
                "present"
              ]
            }
          ],
          "feedback": "Once we got there. The teacher was // Missing a period after there"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 14,
              "words": [
                "To",
                "started"
              ]
            },
            {
              "line_number": 15,
              "words": [
                "get"
              ]
            }
          ],
          "feedback": "to get started, //Missing comma"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 16,
              "words": [
                "Las",
                "to",
                "loud",
                "!"
              ]
            }
          ],
          "feedback": "was too loud"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 16,
              "words": [
                "to",
                "loud",
                "!",
                ",",
                "we",
                "were"
              ]
            }
          ],
          "feedback": "too loud we were"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 18,
              "words": [
                "the",
                "200",
                "50",
                "everyone"
              ]
            }
          ],
          "feedback": "the zoo, so everyone // Missing comma after zoo"
        },
        {
          "error_type": "improvement",
          "lines": [
            {
              "line_number": 20,
              "words": [
                "we",
                "got",
                "in",
                "we"
              ]
            }
          ],
          "feedback": "we got inside the zoo, we // Missing comma after in"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 22,
              "words": [
                "Sign",
                "saying",
                "tok",
                "NO",
                "LITTERing",
                "\"",
                "but"
              ]
            }
          ],
          "feedback": "sign saying, NO LITTERING //Missing Comma"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 22,
              "words": [
                "LITTERing",
                "\"",
                "but"
              ]
            }
          ],
          "feedback": "NO LITTERING, but //Missing Comma"
        },
        {
          "error_type": "spelling",
          "lines": [
            {
              "line_number": 29,
              "words": [
                "diffrent"
              ]
            }
          ],
          "feedback": "different"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 30,
              "words": [
                "giraffe",
                "elephant",
                "flamingo"
              ]
            }
          ],
          "feedback": "giraffes, elephants, flamingos"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 31,
              "words": [
                "Aften",
                "that",
                "we"
              ]
            }
          ],
          "feedback": "After that, we // Missing comma"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 31,
              "words": [
                "nad",
                "Snack"
              ]
            }
          ],
          "feedback": "had snacks"
        },
        {
          "error_type": "improvement",
          "lines": [
            {
              "line_number": 32,
              "words": [
                "Still",
                "Walking",
                "as",
                "we",
                "had"
              ]
            },
            {
              "line_number": 33,
              "words": [
                "Snacks",
                "but"
              ]
            }
          ],
          "feedback": "we had our snacks while walking around. ////we were still walking as we had snacks is unclear."
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 33,
              "words": [
                "after",
                "Cating",
                "I"
              ]
            }
          ],
          "feedback": "after eating, I //Missing comma after eating"
        },
        {
          "error_type": "improvement",
          "lines": [
            {
              "line_number": 34,
              "words": [
                "class",
                "mate",
                "litter",
                "on",
                "the"
              ]
            },
            {
              "line_number": 35,
              "words": [
                "Saw",
                "my"
              ]
            },
            {
              "line_number": 36,
              "words": [
                "floor",
                "."
              ]
            }
          ],
          "feedback": "saw my classmate litter on the ground."
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 39,
              "words": [
                "and",
                "asked",
                "\"",
                "What",
                "Happened",
                "?"
              ]
            }
          ],
          "feedback": "and asked, What happened. ///Missing comma after asked"
        },
        {
          "error_type": "spelling",
          "lines": [
            {
              "line_number": 39,
              "words": [
                "replyed"
              ]
            }
          ],
          "feedback": "replied"
        },
        {
          "error_type": "grammar",
          "lines": [
            {
              "line_number": 39,
              "words": [
                "to",
                "her"
              ]
            }
          ],
          "feedback": "Missing comma after her"
        },
        {
          "error_type": "compliment",
          "lines": [
            {
              "line_number": 43,
              "words": [
                "red",
                "as",
                "a",
                "tomato"
              ]
            }
          ],
          "feedback": "red as a tomato is a great expression!"
        }
      ]
      \`\`\`


      **Complete good quality example 8 with extractedText, inputData, and the expected generated output **:      
      \`\`\`
      extractedText: 
      "Today is the school outing!" John exclaimed  
      excitedly. It was a hot and sunny Monday.  
      Everyone in John's class are going for a trip to  
      the Singapore Zoo. As Johns form teacher Mr Dan  
      told everyone what to bring the other day,  
      they know what to bring.  
      Once they were ready, everyone was boarding  
      the bus. John felt like he was going on an  
      adventure. It was a 1 hour journey, so everyone  
      was chatting on the bus while they were going  
      to the Zoo.  
      After they were there, Mr Dan told  
      everyone to form one line. Mr Dan went to  
      the ticket centre to get 32 ticket as there  
      there were 32 students in Mr Dan's class.  
      Mr Dan gave everyone their tickets and told  
      them to hold on to them tightly. John was eager to  
      get started on the trip. John saw a warning sign  
      that said: "No Littering!"
      Mr Dan snacks to munch on while  
      seeing the animals. On first, they saw  
      monkeys, John was curious to find out why  
      monkeys love bananas so much. Next, they  
      saw tigers and elephants. John and his  
      classmates were eager to see the animal show.  
      After that, the went to the animal show  
      and saw monkey's performing.
      "This is really fun," said John's friend  
      Tom. Tom is always clumsy and breaking  
      things by accident. When Tom wanted to  
      throw the rubbish he purposly threw it  
      on the floor.  
      Since anybody didn't see it, he went  
      back to his seat. Out of nowhere a monkey  
      came to his seat and pushed him down  
      and got rubbish and saw if there were  
      any snacks. John was shocked to see that.
      After, the animal controls came, took  
      the monkey. Tom was petrified. Mr Dan  
      cooled Tom down. At last, Tom knew his  
      mistake and said sorry to Mr Dan and  
      the zoo keeper.  
      After that everyone went back to school  
      happily.  

      inputData:
      0. Lianhua
      1. SCHOOL primary CLASS IS DATE 10c2024
      2. NAME / INDEX NO .. Dhayshin Go SUBJECT EL Paper 1
      3. " Today is the school puling ! " Johns endaimed
      4. . It was a hot and sunny
      5. excitedly Monday
      6. .
      7. Everyone in John's class are going for a trip to
      8. the Singapore Zoo . As John's form teacher . Mr. Dan
      9. Fold what to bring
      10. everyone bring the the other day ,.
      11. to
      12. they know what bring
      13. ) Once , they boarding .
      14. were ready everyone was
      15. the bus . John felt like he was going an
      16. adventure . It was a T haur Soumey , so everyone
      17. was chadling on the bus while they " were
      18. going
      19. to the Zoo .
      20. After
      21. they were there Mr Dan told .
      22. to form one line . Mr Dan went to
      23. Every one
      24. the ticket centre to get 32 ticket as there
      25. Seis
      26. there were 32 students in Mr Dan's class .
      27. Mr. Dan their tickets and told
      28. gave everyone
      29. them hold on to them tightly . John was eager to
      30. get started on the trip . John saw a warning w sign
      31. that said ' No Littering .
      32. Mr Dan snacks to munch on while
      33. Seeing the animals . On first . They Saw
      34. I monkeys ; John was curious to find out why
      35. love bananas so much . Next , they
      36. monkeys
      37. Saw tigers and elephants . John and his
      38. Classmates Were eager to see the animal show .
      39. After that the went to the animal show
      40. land saw monkey's performing .
      41. " This is really fun " said John's Frient .
      42. Tom . Tom is always clumsy and
      43. breaking
      44. SCHOOL Lian hua primary CLASS 415 DATE 10 Oct 2024
      45. NAME / INDEX NO . Dhagshin ( 26 ) SUBJECT El Paper 1
      46. things by accident . When Tom wanted to
      47. throw the rubbish
      48. he purposly threw it
      49. on the floor .
      50. Since anybody didn't . See it , he went
      51. back to his seat . Out of nowhere
      52. a monkey
      53. came to his seat and pushed him down .
      54. and got rubbish and saw if there were
      55. any snacks . John was shocked to see that
      56. Arter , the animal controls came took
      57. the monkey . Tom was petrified . Mr Dan
      58. cooled Tom down . At last : Tom knew his
      59. mistake and said sorry to Mr. Dan and
      60. the Zookeeper .
      61. A After that ever went back to school
      62. eryone
      63. Seis
      64. happily. happily .

      Expected Output:
      [
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 7, "words": ["class", "are", "going"]}
            ],
            "feedback": "class is going // Everyone is singular, so the verb should be 'is' not 'are'."
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 8, "words": ["As", "John", "'", "s", "form", "teacher", "."]}
            ],
            "feedback": "As John's form teacher,"
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 8, "words": ["Mr", ".", "Dan"]},
                {"line_number": 9, "words": ["Fold", "what", "to", "bring"]}
            ],
            "feedback": "Mr. Dan had told everyone what to bring."
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 12, "words": ["they", "know", "what", "bring"]}
            ],
            "feedback": "they knew what to bring."
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 13, "words": [")", "Once", ",", "they", "boarding", "."]},
                {"line_number": 14, "words": ["were", "ready", "everyone", "was"]},
                {"line_number": 15, "words": ["the", "bus", "."]}
            ],
            "feedback": "Once everyone was ready, they boarded the bus."
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 16, "words": ["T"]}
            ],
            "feedback": "one"
        },
        
        {
            "error_type": "compliment",
            "lines": [
                {"line_number": 16, "words": ["Soumey"]}
            ],
            "feedback": "journey is a great expression!"
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 16, "words": ["so", "everyone"]}
            ],
            "feedback": "So, everyone // Missing comma after 'so'."
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 17, "words": ["they", "\"", "were"]},
                {"line_number": 18, "words": ["going"]}
            ],
            "feedback": "they were on their way."
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 20, "words": ["After"]},
                {"line_number": 21, "words": ["they", "were", "there", "Mr", "Dan"]}
            ],
            "feedback": "Once they arrived, Mr. Dan // 'After they were there' is redundant; 'Once there' is simpler."
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 22, "words": ["Mr", "Dan"]}
            ],
            "feedback": "Mr. Dan"
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 24, "words": ["ticket", "centre"]}
            ],
            "feedback": "ticket center"
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 24, "words": ["32", "ticket", "as"]}
            ],
            "feedback": "32 tickets as"
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 30, "words": ["get", "started", "on", "the", "trip", "."]}
            ],
            "feedback": "get started on the adventure."
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 31, "words": ["said", "'", "No", "Littering", "'"]}
            ],
            "feedback": "says, 'No Littering'."
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 32, "words": ["Mr", "Dan", "snacks", "to", "munch", "on", "while"]},
                {"line_number": 33, "words": ["Seeing", "the", "animals", "."]}
            ],
            "feedback": "Mr. Dan handed out snacks while they were seeing the animals. // The sentence is incomplete."
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 33, "words": ["On", "first", "."]}
            ],
            "feedback": "Firstly,"
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 33, "words": ["Saw"]},
                {"line_number": 34, "words": ["I", "monkeys", ";"]}
            ],
            "feedback": "saw the monkeys."
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 35, "words": ["Next", ",", "they"]}
            ],
            "feedback": "Next, they // Missing comma."
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 39, "words": ["that", "the"]}
            ],
            "feedback": "that, they."
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 40, "words": ["saw", "monkey", "'", "s", "performing", "."]}
            ],
            "feedback": "saw monkeys performing."
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 41, "words": ["fun"]}
            ],
            "feedback": "Fun, // Missing comma."
        },
        {
            "error_type": "spelling",
            "lines": [
                {"line_number": 41, "words": ["frient"]}
            ],
            "feedback": "friend."
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 47, "words": ["throw", "the", "rubbish"]},
                {"line_number": 48, "words": ["he", "purposly", "threw", "it"]}
            ],
            "feedback": "throw the rubbish, he purposely threw it. // Missing comma after rubbish and spelling correction for 'purposely'."
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 49, "words": ["floor"]}
                
            ],
            "feedback": "ground. "
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 50, "words": ["Since","anybody","did't",".","See","it",","]}
                
            ],
            "feedback": "Since no one had seen it, "
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 51, "words": ["nowhere"]}
                
            ],
            "feedback": "nowhere, //Missing comma after nowhere"
        },

        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 53, "words": ["down", "."]}
            ],
            "feedback": "down,"
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 54, "words": ["and", "got", "rubbish", "and", "saw", "if", "there", "were", "any", "snacks"]}
            ],
            "feedback": "grabbed the rubbish, and checked if there were any snacks. // 'Got rubbish and saw' is unclear and grammatically incorrect."
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 56, "words": ["Arter", ",", "the"]}
            ],
            "feedback": "Afterward, the."
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 56, "words": ["the", "animal", "controls", "came", "took"]},
                {"line_number": 57, "words": ["the", "monkey"]}
            ],
            "feedback": "the animal control officers came and took the monkey away."
        },
        {
            "error_type": "compliment",
            "lines": [
                {"line_number": 57, "words": ["petrified"]}
            ],
            "feedback": "petrified is a great expression!"
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 57, "words": ["Mr", "Dan"]},
                {"line_number": 58, "words": ["cooled", "Tom", "down", "."]}
            ],
            "feedback": "Mr. Dan calmed Tom down. // The sentence is grammatically correct, but 'cooled' might imply physical cooling."
        },
        {
            "error_type": "grammar",
            "lines": [
                {"line_number": 58, "words": ["At", "last", ":", "Tom"]}
            ],
            "feedback": "At last, Tom // Missing comma."
        },
        {
            "error_type": "improvement",
            "lines": [
                {"line_number": 61, "words": ["After", "that", "ever", "went"]}
            ],
            "feedback": "After that, everyone."
        }
      ]
      \`\`\`


      **Complete good quality example 9 with extractedText, inputData, and the expected generated output **:      
      \`\`\`
      extractedText: 
      It was a glorious Monday morning. All of us were going for a  
      school outing and all of us were eager to get started.  
      We went to the Singapore zoo, our favourite place we went since  
      we were ~~kindergarden~~. We learnt about the animals and adored the wild. We noted  
      down the species of animals. I asked to my teacher, "Can we go on a tram ride?" Our  
      teacher nodded her head in approval. I felt like a dog with two tails and I was  
      jumping up and down in joy. The tram ride was scary because it went up and I saw  
      some scary fictional characters and it was also fun at the same time. We thanked  
      her for this enjoyable ride and wanted to go for a 10 min stroll. We saw baby hippos, cubs,  
      elephants and many more in the wild. We asked our teachers, "Can we go for some more  
      rides?" Our teachers said, "Yes, but only 5 more rides." We squealed in delight and  
      it was the same experience from our first ride. After one hour of these rides,  
      it was time for our snack break. All of us ate bananas, apples, kiwis and plain cookies.  
      One of my classmates, Ira, threw the banana peel on the floor. I jumped out of one's  
      skin and told her, "Ira, you should not litter on the floor. Otherwise, it will attract  
      insects and flies." Ira did not listen, so I told my teacher about the incident. My teacher went  
      back to Ira, with her face turning as red as a tomato. Ira finally came to her senses that she  
      littered and my teacher was angry with her. She felt embarased, with her cheeks blushing.  
      She apologised to my teacher and me for not listening  
      and promised us to never ever litter again when we are going for our next exciting  
      learning journey.
      
      inputData:
      0. SCHOOL Ellie Chaudhary CLASS 415 DATE 10 October 2024
      1. NAME / INDEX NO . 4 SUBJECT English Paper I CCompo )
      2. It was a glorious Monday morning . All of us were going for a
      3. School outing and all of us were eager to to get get started .
      4. We went to the Singapore Zoo , our favourite place we went since
      5. we were Kindergarden . We learnt about the animals and adored the wild . We noted .
      6. ון "
      7. down the species of animals . I asked to to : my teacher " Can we go on a tram ride ? " Our
      8. teacher nodded her head in approval . I felt like a dog with two tails and I was
      9. jumping up and down in joy . The tram ride was scary because it went and I saw
      10. up
      11. Some scary fictional characters and it was also fun at the same time . We than Ked
      12. her for this enjoyable ride and wanted to ogo for a 10min stroll . We saw baby hippos , cubs ,
      13. elephants and many more in the wild . We asked our teachers , " Can we go for r Some more
      14. rides ? " Our teachers said , " Yes , but only 5 more rides . " We squealed in delight delig and
      15. it was the same experience from our first ride . After one hour of these rides ,
      16. it was time for our snack break . All of us ate bananas , apples , Kiwis and plain cookies .
      17. One of my classmates , Ira , threw the banana peel on the floor . I jumped out of one's
      18. skin and told her , " Ira , you should not litter on the floor . Otherwise , it will attract
      19. Seis
      20. insects and flies . " Ira did not listen , so I told my teacher about the incident . My teacher went
      21. back to Ira , with her face turning as red as a tomato . Ira finally came to hersenses that she
      22. littered and my teacher was angry with her . She felt embarrased , with her cheeks blushing .
      23. She apologised to my teacher and me for not listening
      24. and promised us to never ever litter again when we are • going for our next exciting
      25. learning journey .

      Expected Output:
      [
        {
            "error_type": "compliment",
            "lines": [
                {
                    "line_number": 2,
                    "words": [
                        "glorious"
                    ]
                }
            ],
            "feedback": "glorious is a great expression!"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 4,
                    "words": [
                        "our",
                        "favourite",
                        "place",
                        "we",
                        "went",
                        "since"
                    ]
                }
            ],
            "feedback": "our favorite place since"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 5,
                    "words": [
                        "we",
                        "were",
                        "Kindergarden"
                    ]
                }
            ],
            "feedback": "we were in kindergarten"
        },
        {
            "error_type": "compliment",
            "lines": [
                {
                    "line_number": 5,
                    "words": [
                        "adored"
                    ]
                }
            ],
            "feedback": "adored is a great expression!"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 7,
                    "words": [
                        "I",
                        "asked",
                        "to",
                        "to",
                        ":",
                        "my",
                        "teacher"
                    ]
                }
            ],
            "feedback": "I asked my teacher"
        },
        {
            "error_type": "compliment",
            "lines": [
                {
                    "line_number": 9,
                    "words": [
                        "jumping",
                        "up"
                    ]
                }
            ],
            "feedback": "jumping up is a great expression!"
        },
        {
            "error_type": "compliment",
            "lines": [
                {
                    "line_number": 12,
                    "words": [
                        "her"
                    ]
                }
            ],
            "feedback": "our teacher"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 12,
                    "words": [
                        "10min",
                        "stroll",
                        "."
                    ]
                }
            ],
            "feedback": "Ten minute stroll."
        },
        {
            "error_type": "compliment",
            "lines": [
                {
                    "line_number": 14,
                    "words": [
                        "squealed"
                    ]
                }
            ],
            "feedback": "squealed is a great expression!"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 17,
                    "words": [
                        "jumped",
                        "out",
                        "of",
                        "one",
                        "'",
                        "s"
                    ]
                },
                {
                    "line_number": 18,
                    "words": [
                        "skin",
                        "and",
                        "told",
                        "her"
                    ]
                }
            ],
            "feedback": "jumped out of my skin and told her,"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 24,
                    "words": [
                        "promised",
                        "us",
                        "to",
                        "never",
                        "ever"
                    ]
                }
            ],
            "feedback": "promised us to never litter again."
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 24,
                    "words": [
                        "promised",
                        "us",
                        "to",
                        "never",
                        "ever"
                    ]
                }
            ],
            "feedback": "promised us never to litter again"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 24,
                    "words": [
                        "when",
                        "we",
                        "are",
                        "•",
                        "going"
                    ]
                }
            ],
            "feedback": "when we go"
        }
      ] 
      \`\`\`


      **Complete good quality example 10 with extractedText, inputData, and the expected generated output **:      
      \`\`\`
      extractedText: 
      NAME/INDEX NO. Esperanza (13)                             SUBJECT  ELPaper1
      A time when your classmate did not notice a warning sign
      It was a glorious Monday, ~~my friends and I~~ all the students were excited to go zoo
      our class to see animals. When the bus had arrive at the Singapore Zoo all the students were excited to explore the zoo.
      [^ After some time] we entered the zoo we were exploring started
      th zoo. I saw a sign said "no littering". After a while, as we were
      eating ~~~~~~~~~~~& our snack, I saw one of ~~my friend~~ littering. I went to
      comfort her no to littering but she ignored me and I told again
      not to littering but she ignored me again. So I went to tell my
      teacher what was happening and ~~she~~ told her but again she ignored.
      "Jess, stop littering, did you see the sign, the sign said "no
      littering!" I yelled
      Jess felt shocked and threw a~~way her~~ rubbish and said,
      "~~sorry~~". And she said that she will ~~never~~ do it again. And learned her ~~the~~
      lesson to never litter again.
      After some time, we went back to exploring the zoo.
      
      inputData:
      0. SCHOOL_ CLASS 415 DATE 10 October 2024
      1. NAME / INDEX NO . Esperanza ( 13 ) SUBJECT . ELPaper
      2. It A was time a when glorious your Monday classmates , my the friends did stradent not and I were notice excited a warning to go sign 200 p
      3. Our class Zoo of - us
      4. When the Bakhool had arrive at the Singapore Zoo all the student were
      5. excited to explore the 200 .
      6. we were eager to started exp song as
      7. After some time we entered the 200 we were exploring
      8. the 200 I Saw a sign said " no littering " . After a while , as we were
      9. my
      10. eating & our snack , I saw one of May friend littering . I when to
      11. me
      12. Comfront her no to littering but she ingored nostet and I told again
      13. not to littering but she ingored , me again . So I went to tell my
      14. was my teacher She
      15. teacher what 12 happening and they told her but again saxy in gored .
      16. " Jess , stop littering did you see the sign the sign said . " no
      17. littering ! " I yelled
      18. Jess felt shocked and threw a way her rubbish and Said
      19. Jess
      20. " Sorry " . And she said that she will never do it again . And she learnt her
      21. never
      22. lesson to hevem litter again .
      23. After some time , we went back to exploring the 200
      24. Seis

      Expected Output:
      [
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 2,
                    "words": [
                        "Monday",
                        "classmates",
                        ",",
                        "my",
                        "the ",
                        "friends"
                    ]
                }
            ],
            "feedback": "Monday, my friends and I"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 2,
                    "words": [
                        "to",
                        "go",
                        "sign",
                        "200",
                        "p"
                    ]
                }
            ],
            "feedback": "to go to the zoo"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 4,
                    "words": [
                        "When"
                    ]
                }
            ],
            "feedback": "When"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 4,
                    "words": [
                        "When",
                        "the",
                        "Bakhool",
                        "had",
                        "arrive",
                        "at"
                    ]
                }
            ],
            "feedback": "When the bus arrived"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 4,
                    "words": [
                        "Singapore",
                        "zoo",
                        "all",
                        "the",
                        "student"
                    ]
                }
            ],
            "feedback": "Singapore Zoo, all the students"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 6,
                    "words": [
                        "we",
                        "were",
                        "eager",
                        "to",
                        "started",
                        "exp",
                        "song",
                        "as"
                    ]
                }
            ],
            "feedback": "we were eager to start exploring. As"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 8,
                    "words": [
                        "the",
                        "200"
                    ]
                }
            ],
            "feedback": "the zoo."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 8,
                    "words": [
                        "I",
                        "Saw",
                        "a",
                        "sign",
                        "said",
                        "\"",
                        "no",
                        "littering",
                        "\""
                    ]
                }
            ],
            "feedback": "I saw a sign that said, 'No Littering.'"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 10,
                    "words": [
                        "of",
                        "May",
                        "friend",
                        "littering",
                        "."
                    ]
                }
            ],
            "feedback": "of my friends littering."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 10,
                    "words": [
                        "I",
                        "when",
                        "to"
                    ]
                },
                {
                    "line_number": 11,
                    "words": [
                        "me"
                    ]
                },
                {
                    "line_number": 12,
                    "words": [
                        "comfront",
                        "her",
                        "no",
                        "to",
                        "littering",
                        "but",
                        "she",
                        "ingored",
                        "nostest"
                    ]
                }
            ],
            "feedback": "I went to confront her about littering, but she ignored me."
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 12,
                    "words": [
                        "I",
                        "told",
                        "again"
                    ]
                }
            ],
            "feedback": "I told her again."
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 13,
                    "words": [
                        "littering"
                    ]
                }
            ],
            "feedback": "litter"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 13,
                    "words": [
                        "ingored"
                    ]
                }
            ],
            "feedback": "ignored"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 15,
                    "words": [
                        "what",
                        "12",
                        "happening",
                        "and",
                        "they",
                        "told",
                        "her",
                        "but",
                        "again",
                        "saxy",
                        "in",
                        "gored",
                        "."
                    ]
                }
            ],
            "feedback": "what was happening, but my classmate continued to ignore her warnings."
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 16,
                    "words": [
                        "\"",
                        "Jess",
                        ",",
                        "stop",
                        "littering",
                        "did",
                        "you"
                    ]
                }
            ],
            "feedback": "Jess, stop littering! Did you"
        },
        {
            "error_type": "improvement",
            "lines": [
                {
                    "line_number": 16,
                    "words": [
                        "sign",
                        "the",
                        "sign",
                        "said",
                        ".",
                        "\"",
                        "no"
                    ]
                },
                {
                    "line_number": 17,
                    "words": [
                        "littering",
                        "!"
                    ]
                }
            ],
            "feedback": "sign that says, No Littering."
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 17,
                    "words": [
                        "I",
                        "yelled"
                    ]
                }
            ],
            "feedback": "I yelled. // Missing period"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 18,
                    "words": [
                        "threw",
                        "a",
                        "way"
                    ]
                }
            ],
            "feedback": "threw away"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 18,
                    "words": [
                        "and",
                        "Said"
                    ]
                },
                {
                    "line_number": 19,
                    "words": [
                        "Jess"
                    ]
                },
                {
                    "line_number": 20,
                    "words": [
                        "\"",
                        "Sorry",
                        "\""
                    ]
                }
            ],
            "feedback": "and said, 'Sorry.' // Missing comma after said"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 20,
                    "words": [
                        "will"
                    ]
                }
            ],
            "feedback": "would"
        },
        {
            "error_type": "grammar",
            "lines": [
                {
                    "line_number": 23,
                    "words": [
                        "After",
                        "some",
                        "time",
                        ",",
                        "we"
                    ]
                }
            ],
            "feedback": "After some time, we"
        }
      ]
      \`\`\`

      **Important Notes**:

      - **Only respond with the JSON data** (without any further explanation or text).
      - **Do not include any additional commentary** outside the JSON data.
      - Ensure that the **errors and feedback are derived solely from 'extractedText'**.
      - Use **'inputData' only for mapping purposes**.
      - Do Not include backticks in your answer

      **Here are the inputs**:

      **'extractedText'**:
      ${extractedText}

      **'inputData'**:
      ${inputData}
    `;
};

module.exports = { newCheckerPromptTemplate };
