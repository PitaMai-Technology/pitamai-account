export async function renderEmail(
  templateName: string,
  props?: Record<string, any>,
  options?: Record<string, any>
) {
  try {
    const result = await renderEmailComponent(templateName, props, options);
    if (result && typeof result === 'object' && 'html' in result) {
      return result.html as string;
    }
    return result as string;
  } catch (error) {
    console.error(
      'Failed to render email template',
      templateName,
      error instanceof Error ? error.message : error
    );
    throw error instanceof Error
      ? error
      : new Error('Failed to load email template');
  }
}

export default renderEmail;
