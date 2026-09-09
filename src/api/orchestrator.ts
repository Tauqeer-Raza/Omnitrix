import type { Task } from '../types';
/** Demo routing. FastAPI replaces this decision with its real orchestrator. */
export function classifyPrompt(
  prompt: string,
  documentIds: string[],
  previous?: Task,
): Task['type'] {
  if (
    /\b(code|python|script|calculate|calculation|pressure drop|formula|program|unit tests?)\b/i.test(
      prompt,
    )
  )
    return 'code';
  if (documentIds.length) return 'document';
  if (
    previous &&
    /\b(it|that|this|shorter|longer|rewrite|expand|summari[sz]e|continue)\b/i.test(
      prompt,
    )
  )
    return previous.type;
  return 'general';
}
export function mockReply(task: Task): string {
  if (task.type === 'document')
    return 'I’ve prepared a draft review of the sample inspection report.\n\n• Localized surface oxidation is noted at support S-04.\n• The calibration certificate still needs verification.\n• Final acceptance should wait for a responsible engineer’s review.\n\nOpen the report below or download it for review. These findings come from the demonstration report; uploaded documents have not been analyzed by an AI model.';
  if (task.type === 'code')
    return 'I’ve prepared a Python calculation example with input checks and unit tests.\n\nFor the sample pipeline (120 m length, 0.15 m diameter and 0.025 m³/s flow), the pressure drop is 15,979.23 Pa, or 0.1598 bar.\n\nOpen the calculation to review the assumptions, edit the code, or download it. This is a worked demonstration; confirm that its inputs match your equipment.';
  if (
    /\b(shorter|brief|summari[sz]e|concise)\b/i.test(task.prompt) &&
    task.conversationId
  )
    return 'Here is a shorter version of the sample guidance:\n\nVerify the source records, note discrepancies, and send the findings to the responsible engineer for review. Include the equipment reference and outstanding actions.\n\nThis is a demonstration response; the connected local model will use the full conversation to produce the final answer.';
  if (/\b(sop|procedure|safety|inspection|maintenance)\b/i.test(task.prompt))
    return 'Here’s a starting point for reviewing an inspection or maintenance procedure:\n\n1. Identify the equipment, document revision and inspection scope.\n2. Check measurement records and instrument calibration.\n3. Record discrepancies and any missing information.\n4. Ask the responsible engineer to confirm the applicable acceptance criteria.\n\nThe sample local library includes Pipeline Safety SOP and Maintenance Manual. Attach a document for a review, or open Knowledge Base to find a reference. This example is not an operational instruction or approval.';
  if (/\b(handover|shift|note|draft|report)\b/i.test(task.prompt))
    return 'Here’s a simple structure you can use for your note:\n\nSubject: [Equipment or work reference]\nCurrent status: [Brief description]\nObservations: [What was checked and what was found]\nOutstanding actions: [Action, owner and due date]\nNext review: [Responsible person]\n\nShare the details you would like included, and continue here to refine the draft.';
  return 'I can help you review a document, prepare a note, check a calculation, or find an organizational procedure.\n\nTell me the equipment or topic involved and the result you need. You can also attach a file here. I’ll keep the conversation together and select the appropriate local workflow.\n\nThis is a demonstration response. The connected local model will answer your specific request.';
}
