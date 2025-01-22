import { Context, Session } from "koishi";
import type {
  Condition,
  ConditionGroup,
  ConditionKey,
  ConditionLogic,
  ConditionValue,
  Config,
  Rule,
} from "./Config";

export const name = "command-interceptor";

export { Config } from "./Config";
const IsCmd = Symbol("command-interceptor-is-cmd");
const SourceCmd = Symbol("command-interceptor-source-cmd");
export function apply(ctx: Context, config: Config) {
  const rules = [...(config.rules || [])].sort(
    (a, b) => a.priority - b.priority,
  );
  ctx.on(
    "command/before-execute",
    (argv) => {
      if (!argv.session) {
        return;
      }
      argv.session[IsCmd] = true;
      let cmd: string[] = [argv.command.name];

      if (cmd.includes("help")) {
        if (Array.isArray(argv.args)) {
          const sourceCmd: string[] = argv.session[SourceCmd];
          if (sourceCmd?.includes(argv.args?.[0])) {
            cmd = sourceCmd;
          }
        }
      } else if (argv.command._aliases) {
        cmd.push(...Object.keys(argv.command._aliases));
        argv.session[SourceCmd] = [...cmd];
      }

      const { whitelist, blacklist } = getRuleCommandList(argv.session, rules);
      if (blacklist.some((c) => cmd.includes(c))) {
        return "";
      }

      if (whitelist.length > 0 && whitelist.every((c) => !cmd.includes(c))) {
        return "";
      }
    },
    true,
  );

  ctx.on(
    "before-send",
    (_session, options) => {
      if (!options?.session || options.session[IsCmd]) {
        return;
      }
      const { allowNotCommandMessage } = getRuleCommandList(
        options.session as any,
        rules,
      );
      if (allowNotCommandMessage) {
        return;
      }
      return true;
    },
    true,
  );
}

const getConditionVal: {
  [K in ConditionKey]: (session: Session) => any;
} = {
  private: (session) => session.isDirect,
  userId: (session) => session.userId,
  groupId: (session) => session.guildId,
  channelId: (session) => session.channelId,
  botId: (session) => session.bot.selfId,
  platform: (session) => session.platform,
};
const verifyConditionLogic: {
  [K in ConditionLogic]: (val: any, conditionValue: ConditionValue) => boolean;
} = {
  equalTo: (val, conditionValue) => {
    const type = typeof conditionValue;
    return type === "boolean"
      ? conditionValue === !!val
      : type === "string"
        ? conditionValue === val + ""
        : false;
  },
  notEqualTo: (val, conditionValue) =>
    !verifyConditionLogic["equalTo"](val, conditionValue),
  include: (val, conditionValue) =>
    typeof conditionValue === "object"
      ? conditionValue.value.includes(val + "")
      : verifyConditionLogic["equalTo"](val, conditionValue),
  notInclude: (val, conditionValue) =>
    !verifyConditionLogic["include"](val, conditionValue),
};
function verifyCondition(session: Session, condition: Condition) {
  return verifyConditionLogic[condition.logic](
    getConditionVal[condition.key](session),
    condition.value,
  );
}

function verifyConditionGroup(
  session: Session,
  conditionGroup: ConditionGroup,
) {
  const _verifyCondition = (condition: Condition) =>
    verifyCondition(session, condition);
  return conditionGroup.internalLogic === "and"
    ? conditionGroup.conditions.every(_verifyCondition)
    : conditionGroup.conditions.some(_verifyCondition);
}

function verifyConditionGroups(
  session: Session,
  conditionGroups: ConditionGroup[],
) {
  let logicStatus: boolean = null;
  for (const conditionGroup of conditionGroups) {
    const res = verifyConditionGroup(session, conditionGroup);
    const isAnd = conditionGroup.externalLogic === "and";
    logicStatus =
      logicStatus === null
        ? res
        : isAnd
          ? logicStatus && res
          : logicStatus || res;
    if (isAnd ? !logicStatus : logicStatus) {
      break;
    }
  }
  return logicStatus;
}

function getRuleCommandList(
  session: Session,
  rules: Rule[],
): {
  whitelist: string[];
  blacklist: string[];
  allowNotCommandMessage: boolean;
} {
  const whitelist: string[] = [];
  const blacklist: string[] = [];
  let allowNotCommandMessage = true;
  for (let rule of rules) {
    const res = verifyConditionGroups(session, rule.conditionGroups);
    if (!res) {
      continue;
    }
    const isWhite = rule.type === "whitelist";
    if (isWhite) {
      whitelist.push(...(rule.command || []));
    } else {
      blacklist.push(...(rule.command || []));
    }
    if (allowNotCommandMessage) {
      allowNotCommandMessage = isWhite
        ? rule.notCommandMessage
        : !rule.notCommandMessage;
    }
  }
  return { whitelist, blacklist, allowNotCommandMessage };
}
