import { Schema } from "koishi";

export type ConditionKey =
  | "private"
  | "userId"
  | "groupId"
  | "channelId"
  | "botId"
  | "platform";
export type ConditionLogic =
  | "equalTo"
  | "notEqualTo"
  | "include"
  | "notInclude";
export type ConditionValue = string | boolean | { value: string[] };

export interface Condition {
  key: ConditionKey;
  logic: ConditionLogic;
  value: ConditionValue;
}

export type AndOr = "and" | "or";
export interface ConditionGroup {
  externalLogic?: AndOr;
  internalLogic?: AndOr;
  conditions: Condition[];
}
export type RuleType = "whitelist" | "blacklist";
export interface Rule {
  type: RuleType;
  priority: number;
  command: string[];
  notCommandMessage: boolean;
  conditionGroups: ConditionGroup[];
}
export interface Config {
  rules: Rule[];
}

const CommonSchema = {
  AndOr: () =>
    Schema.union([
      Schema.const("and").description("and"),
      Schema.const("or").description("or"),
    ]).role("radio"),
};

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    rules: Schema.array(
      Schema.intersect([
        Schema.object({
          type: Schema.union([
            Schema.const("whitelist").description("whitelist"),
            Schema.const("blacklist").description("blacklist"),
          ])
            .role("radio")
            .default("whitelist"),
          priority: Schema.number().default(100),
          command: Schema.array(Schema.string().required()),
          notCommandMessage: Schema.boolean().default(false),
        }),
        Schema.object({
          conditionGroups: Schema.array(
            Schema.object({
              externalLogic: CommonSchema.AndOr().default("or"),
              internalLogic: CommonSchema.AndOr().default("and"),
              conditions: Schema.array(
                Schema.object({
                  key: Schema.union([
                    Schema.const("private").description("private"),
                    Schema.const("userId").description("userId"),
                    Schema.const("groupId").description("groupId"),
                    Schema.const("channelId").description("channelId"),
                    Schema.const("botId").description("botId"),
                    Schema.const("platform").description("platform"),
                  ]).default("private"),
                  logic: Schema.union([
                    Schema.const("equalTo").description("equalTo"),
                    Schema.const("notEqualTo").description("notEqualTo"),
                    Schema.const("include").description("include"),
                    Schema.const("notInclude").description("notInclude"),
                  ]).default("equalTo"),
                  value: Schema.union([
                    Schema.string().description("string"),
                    Schema.const(true).description("true"),
                    Schema.const(false).description("false"),
                    Schema.object({
                      value: Schema.array(Schema.string()),
                    }).description("array"),
                  ]).required(),
                }),
              ).default([{}] as any),
            }),
          ).default([{}] as any),
        }),
      ]),
    ).default([{}] as any),
  }),
]);
