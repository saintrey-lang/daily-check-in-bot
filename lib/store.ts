import { defaultConfig } from "./checkin/core";
import { CheckinSheetsStore } from "./checkin/sheets";

export function checkinStore(): CheckinSheetsStore {
  return new CheckinSheetsStore(defaultConfig(process.env).sheetId);
}
