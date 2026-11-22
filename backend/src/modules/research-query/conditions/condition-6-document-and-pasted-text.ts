import type {
  ResearchConditionContext,
  ResearchConditionHandler,
} from "./condition-context";
import handleBothSmall from "./condition-6a-both-small";
import handleLargeDocumentSmallPastedText from "./condition-6b-large-document-small-pasted-text";
import handleBothLarge from "./condition-6c-both-large";
import handleSmallDocumentLargePastedText from "./condition-6d-small-document-large-pasted-text";

const combinedInputConditions: ResearchConditionHandler[] = [
  handleBothSmall,
  handleLargeDocumentSmallPastedText,
  handleBothLarge,
  handleSmallDocumentLargePastedText,
];

const handleDocumentAndPastedText: ResearchConditionHandler = async (
  context: ResearchConditionContext,
) => {
  const { document, pastedText, planApprovalStatus } = context;
  if (!document || !pastedText) return null;

  console.log(
    `Condition 6: Both Document (${document.originalname}) and Pasted Text provided (${planApprovalStatus})...`,
  );

  for (const condition of combinedInputConditions) {
    const response = await condition(context);
    if (response !== null) return response;
  }

  return null;
};

export default handleDocumentAndPastedText;
