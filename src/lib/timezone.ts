/**
 * Get the user's local timezone abbreviation (e.g., 'EST', 'IST', 'PST')
 */
export function getTimezoneAbbreviation(): string {
  try {
    const timeStr = new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' });
    const parts = timeStr.split(' ');
    // The timezone abbreviation is typically the last part
    return parts[parts.length - 1] || 'Local';
  } catch {
    return 'Local';
  }
}

/**
 * Get the user's full timezone name (e.g., 'America/New_York')
 */
export function getTimezoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'Local';
  }
}
