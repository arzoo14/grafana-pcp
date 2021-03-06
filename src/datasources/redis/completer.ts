import _ from 'lodash';
import { PCPRedisDatasource } from "./datasource";
import { PmSeriesSrv } from "./pmseries_srv";

export default class PCPRedisCompleter {

    // first regex is required that the auto-completion box shows up
    // when entering a { or "
    identifierRegexps = [/[\{"]/, /[a-zA-Z0-9_.]/];
    pmSeriesSrv: PmSeriesSrv;

    constructor(datasource: PCPRedisDatasource, private dashboardVariables: string[]) {
        this.pmSeriesSrv = datasource.pmSeriesSrv;
    }

    getCompletions(editor: any, session: any, pos: any, prefix: any, callback: any) {
        this.findCompletions(editor, session, pos, prefix).then((value) => {
            callback(null, value);
        }, (reason: any) => {
            callback(reason, []);
        });
    }

    getCompletion(word: string, hiddenPrefix: string, meta: string) {
        return {
            caption: word,
            value: hiddenPrefix + word,
            meta: meta,
            score: Number.MAX_VALUE
        };
    }

    findToken(tokens: any[], type: string) {
        for (let i = tokens.length - 1; i >= 0; i--) {
            if (tokens[i].type === type)
                return tokens[i];
        }
        return null;
    }

    async findMetricCompletions(token: any) {
        const searchPrefix = token.value.substring(0, 1);
        const completions = await this.pmSeriesSrv.getMetrics(`${searchPrefix}*`);
        completions.sort();
        return completions.map((metric: string) => this.getCompletion(metric, "", "metric"));
    }

    private async findQualifiersForToken(metric: string): Promise<Record<string, string[]>> {
        const dashboardVars = this.dashboardVariables.map(v => '$' + v);
        const qualifiers = await this.pmSeriesSrv.getQualifiers(metric);
        for (const qualifier in qualifiers) {
            qualifiers[qualifier].unshift(...dashboardVars);
        }
        return qualifiers;
    }

    getQualifierMetaTag(qualifierKey: string, qualifierValue?: string) {
        if (qualifierValue) {
            if (qualifierValue.startsWith('$'))
                return "dashboard variable";
            else if (qualifierKey === "instance.name")
                return "instance name";
            else
                return "label value";
        }
        else {
            if (qualifierKey === "instance.name")
                return "instance name";
            else
                return "label";
        }
    }

    async findQualifierKeyCompletions(tokens: any[], token: any) {
        const hiddenPrefix = token.value === "{" ? "{" : "";
        const metricToken = this.findToken(tokens, "entity.name.tag.metric");
        if (!metricToken)
            return [];

        const qualifiers = await this.findQualifiersForToken(metricToken.value);
        return Object.keys(qualifiers).map(qualifierKey =>
            this.getCompletion(qualifierKey, hiddenPrefix, this.getQualifierMetaTag(qualifierKey))
        );
    }

    async findQualifierValueCompletions(tokens: any[], token: any) {
        const hiddenPrefix = token.value === '""' ? '"' : '';
        const metricToken = this.findToken(tokens, "entity.name.tag.metric");
        const qualifierKeyToken = this.findToken(tokens, "entity.name.tag.qualifier-key");
        if (!metricToken || !qualifierKeyToken)
            return [];

        const qualifiers = await this.findQualifiersForToken(metricToken.value);
        return (qualifiers[qualifierKeyToken.value] || []).map(qualifierValue =>
            this.getCompletion(qualifierValue, hiddenPrefix, this.getQualifierMetaTag(qualifierKeyToken.value, qualifierValue))
        );
    }

    async findCompletions(editor: any, session: any, pos: any, prefix: any) {
        const token = session.getTokenAt(pos.row, pos.column);
        if (token.type === "entity.name.tag.metric") {
            return this.findMetricCompletions(token);
        }
        else if (token.type === "entity.name.tag.qualifier-key" || token.type === "paren.lparen.qualifiers-matcher") {
            return this.findQualifierKeyCompletions(session.getTokens(pos.row), token);
        }
        else if (token.type === "string.quoted.qualifier-value") {
            return this.findQualifierValueCompletions(session.getTokens(pos.row), token);
        }
        else {
            return [];
        }
    }
}
